import express from 'express';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const SYSTEM_INSTRUCTIONS = `
You are KisanMitra AI, a helpful Indian agricultural assistant.

You must:
- Answer in simple language.
- Give practical farming advice.
- Understand Indian crops and farming conditions.
- Explain crop diseases and prevention.
- Help with irrigation, fertilizers and soil.
- Avoid unsupported claims.
- Never recommend dangerous chemical dosages.
- Recommend local agricultural experts for serious crop disease cases.
`;

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        error: 'Message cannot be empty.'
      });
    }

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: 'Gemini API key is missing.'
      });
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: message.trim(),
      config: {
        systemInstruction: SYSTEM_INSTRUCTIONS,
        temperature: 0.5
      }
    });

    const reply = response.text;

    if (!reply) {
      return res.status(502).json({
        error: 'AI returned an empty response.'
      });
    }

    return res.status(200).json({ reply });

  } catch (error) {
    console.error('Chat API Error:', error);

    return res.status(500).json({
      error: 'Something went wrong. Please try again.'
    });
  }
});

export default router;
