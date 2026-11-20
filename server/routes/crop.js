"use strict";

/**
 * server/routes/crop.js
 *
 * POST /api/crop/analyze
 *   multipart/form-data, field name: "image" (JPG, JPEG or PNG, max 8 MB)
 *
 * The Gemini API key is read from process.env.GEMINI_API_KEY and never
 * leaves the server.
 */

const express = require("express");
const multer = require("multer");
const { GoogleGenAI, Type } = require("@google/genai");

const router = express.Router();

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME = new Set(["image/jpeg", "image/png"]); // .jpg/.jpeg both arrive as image/jpeg
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const REQUEST_TIMEOUT_MS = 45000;

const DISCLAIMER =
  "This is an AI-generated estimate based on one photo, not a confirmed diagnosis. " +
  "Please show the plant to a local agricultural expert, such as your Krishi Vigyan Kendra (KVK) " +
  "or agriculture officer, before buying or applying any treatment.";

/* ------------------------------------------------------------------ */
/* Upload handling (memory only, nothing is written to disk)           */
/* ------------------------------------------------------------------ */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      const err = new Error("Only JPG, JPEG and PNG images are allowed.");
      err.code = "INVALID_FILE_TYPE";
      return cb(err);
    }
    cb(null, true);
  },
});

/**
 * The browser-supplied MIME type can be wrong or spoofed, so we check the
 * file's first bytes and use the real type when talking to Gemini.
 */
function detectMimeType(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (pngSignature.every((byte, i) => buf[i] === byte)) return "image/png";
  return null;
}

/* ------------------------------------------------------------------ */
/* Gemini client (created lazily so a missing key doesn't crash boot)  */
/* ------------------------------------------------------------------ */

let client = null;
function getClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!client) {
    client = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: REQUEST_TIMEOUT_MS },
    });
  }
  return client;
}

/* ------------------------------------------------------------------ */
/* Prompt + response schema                                            */
/* ------------------------------------------------------------------ */

const SYSTEM_INSTRUCTION = `
You are the Crop Doctor assistant inside KisanMitra AI, helping farmers and gardeners understand what might be wrong with a plant from a single photo.

Rules you must follow:
- You are giving a possibility, never a diagnosis. Never say a diagnosis is certain, confirmed or definite. Use wording such as "may be", "could be" and "looks consistent with".
- First decide whether the image actually shows a crop or plant (leaf, stem, fruit, whole plant). If it does not (a person, an animal, an object, a screenshot, a document and so on), set isPlant to false and explain briefly. Do not guess a disease.
- If the image is blurry, dark, too far away, overexposed, or shows too little of the plant, say so clearly in imageQuality and keep confidence low. Ask for a better photo in recommendedNextSteps.
- Describe only symptoms that are visible in the image. Do not invent symptoms.
- If more than one condition is plausible, name the most likely one and list the others in alternatives.
- Never give pesticide, fungicide, herbicide or fertiliser amounts, concentrations, mixing ratios, spray schedules or application rates. Do not name commercial brands. You may mention a general category of treatment only as something to discuss with an expert, and you must tell the user to follow the product label and local guidance.
- Prefer safe first steps: isolate or remove badly affected leaves, improve airflow, adjust watering, check the underside of leaves and nearby plants, take clearer photos, and consult an expert.
- Always recommend verification by a local agricultural expert.
- Use simple, plain English that a farmer can follow. Keep each list item to one short sentence.
`.trim();

const USER_PROMPT = `
Analyze the attached plant photo and return the result as JSON that matches the provided schema.
If the image is not a plant, set isPlant to false and leave the plant-specific fields empty.
`.trim();

const stringList = { type: Type.ARRAY, items: { type: Type.STRING } };

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    isPlant: { type: Type.BOOLEAN },
    summary: { type: Type.STRING },
    imageQuality: {
      type: Type.OBJECT,
      properties: {
        rating: { type: Type.STRING, enum: ["good", "fair", "poor"] },
        note: { type: Type.STRING },
      },
      required: ["rating", "note"],
    },
    cropName: { type: Type.STRING },
    condition: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING },
        type: {
          type: Type.STRING,
          enum: [
            "disease",
            "pest",
            "nutrient_deficiency",
            "environmental_stress",
            "healthy",
            "unknown",
          ],
        },
      },
      required: ["name", "type"],
    },
    confidence: {
      type: Type.OBJECT,
      properties: {
        level: { type: Type.STRING, enum: ["low", "medium", "high"] },
        explanation: { type: Type.STRING },
      },
      required: ["level", "explanation"],
    },
    alternatives: stringList,
    visibleSymptoms: stringList,
    possibleCauses: stringList,
    recommendedNextSteps: stringList,
    preventiveMeasures: stringList,
  },
  required: [
    "isPlant",
    "summary",
    "imageQuality",
    "condition",
    "confidence",
    "alternatives",
    "visibleSymptoms",
    "possibleCauses",
    "recommendedNextSteps",
    "preventiveMeasures",
  ],
};

/* ------------------------------------------------------------------ */
/* Output cleaning: never trust model output blindly                   */
/* ------------------------------------------------------------------ */

const CONFIDENCE_LEVELS = ["low", "medium", "high"];
const CONDITION_TYPES = [
  "disease",
  "pest",
  "nutrient_deficiency",
  "environmental_stress",
  "healthy",
  "unknown",
];
const QUALITY_RATINGS = ["good", "fair", "poor"];

// Matches things like "2 ml per litre", "5g/L", "250 g in 15 litres", "1-2 kg per acre".
const DOSAGE_PATTERN =
  /\b\d+(?:[.,]\d+)?(?:\s*(?:-|to)\s*\d+(?:[.,]\d+)?)?\s*(?:ml|litres?|liters?|l|gm|grams?|g|kg|mg|oz|lbs?)\s*(?:\/|per|in|for)\s*(?:\d+\s*)?(?:litres?|liters?|l|acre|hectare|ha|bigha|tank|pump|plant|gallon)\b/gi;

function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(DOSAGE_PATTERN, "[dose: follow the product label]").trim().slice(0, maxLength);
}

function cleanList(value, maxItems = 8, maxLength = 240) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function normalizeResult(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  const isPlant = data.isPlant === true;

  const quality = {
    rating: pick(data.imageQuality && data.imageQuality.rating, QUALITY_RATINGS, "fair"),
    note: cleanText(data.imageQuality && data.imageQuality.note, 300),
  };

  if (!isPlant) {
    return {
      isPlant: false,
      summary:
        cleanText(data.summary, 500) ||
        "This image doesn't appear to show a crop or plant.",
      imageQuality: quality,
      cropName: null,
      condition: null,
      confidence: null,
      alternatives: [],
      visibleSymptoms: [],
      possibleCauses: [],
      recommendedNextSteps: cleanList(data.recommendedNextSteps, 4).length
        ? cleanList(data.recommendedNextSteps, 4)
        : ["Take a clear, well-lit photo of the affected leaf or plant and try again."],
      preventiveMeasures: [],
    };
  }

  // Server-side guard: an unclear photo can never produce a confident answer.
  let level = pick(data.confidence && data.confidence.level, CONFIDENCE_LEVELS, "low");
  if (quality.rating === "poor") level = "low";
  else if (quality.rating === "fair" && level === "high") level = "medium";

  return {
    isPlant: true,
    summary: cleanText(data.summary, 600),
    imageQuality: quality,
    cropName: cleanText(data.cropName, 80) || null,
    condition: {
      name: cleanText(data.condition && data.condition.name, 120) || "Unclear",
      type: pick(data.condition && data.condition.type, CONDITION_TYPES, "unknown"),
    },
    confidence: {
      level,
      explanation: cleanText(data.confidence && data.confidence.explanation, 400),
    },
    alternatives: cleanList(data.alternatives, 4, 120),
    visibleSymptoms: cleanList(data.visibleSymptoms),
    possibleCauses: cleanList(data.possibleCauses),
    recommendedNextSteps: cleanList(data.recommendedNextSteps),
    preventiveMeasures: cleanList(data.preventiveMeasures),
  };
}

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

router.post("/analyze", upload.single("image"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No image received. Send a JPG or PNG file in the "image" field.',
    });
  }

  const mimeType = detectMimeType(req.file.buffer);
  if (!mimeType) {
    return res.status(400).json({
      success: false,
      error: "That file doesn't look like a valid JPG or PNG image.",
    });
  }

  const ai = getClient();
  if (!ai) {
    console.error("[crop] GEMINI_API_KEY is not set.");
    return res.status(500).json({
      success: false,
      error: "Crop analysis is not available right now. Please try again later.",
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { inlineData: { mimeType, data: req.file.buffer.toString("base64") } },
            { text: USER_PROMPT },
          ],
        },
      ],
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });

    const blockReason = response.promptFeedback && response.promptFeedback.blockReason;
    if (blockReason) {
      return res.status(422).json({
        success: false,
        error: "This image couldn't be analyzed. Please try a different photo of a plant.",
      });
    }

    const text = response.text;
    if (!text) {
      return res.status(502).json({
        success: false,
        error: "The AI didn't return a result. Please try again.",
      });
    }

    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("[crop] Gemini returned invalid JSON.");
      return res.status(502).json({
        success: false,
        error: "The AI returned an unreadable result. Please try again.",
      });
    }

    return res.json({
      success: true,
      result: normalizeResult(parsed),
      disclaimer: DISCLAIMER,
    });
  } catch (err) {
    // Log the message only: never the image, never the API key.
    console.error("[crop] Gemini request failed:", err && err.message ? err.message : err);

    const status = err && err.status;
    if (status === 429) {
      return res.status(429).json({
        success: false,
        error: "Too many requests right now. Please wait a minute and try again.",
      });
    }
    if (status === 503 || status === 504 || (err && /timeout|timed out/i.test(err.message || ""))) {
      return res.status(503).json({
        success: false,
        error: "The AI service is busy or slow. Please try again in a moment.",
      });
    }
    return res.status(500).json({
      success: false,
      error: "Something went wrong while analyzing the image. Please try again.",
    });
  }
});

/* ------------------------------------------------------------------ */
/* Upload errors (wrong type, too large, wrong field name)             */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err && err.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({
      success: false,
      error: `That image is too large. The limit is ${MAX_FILE_BYTES / (1024 * 1024)} MB.`,
    });
  }
  if (err && err.code === "INVALID_FILE_TYPE") {
    return res.status(415).json({ success: false, error: err.message });
  }
  if (err && err.name === "MulterError") {
    return res.status(400).json({
      success: false,
      error: 'Upload failed. Send one image in the "image" field.',
    });
  }
  console.error("[crop] Unexpected error:", err && err.message ? err.message : err);
  return res.status(500).json({
    success: false,
    error: "Something went wrong. Please try again.",
  });
});

module.exports = router;
