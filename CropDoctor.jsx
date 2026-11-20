 import { useState, useRef, useEffect, useCallback } from "react";

/**
 * CropDoctor.jsx
 * Upload a leaf photo, send it to POST /api/crop/analyze, show the AI result.
 * Styles are included in this file, so no extra CSS import is needed.
 */

const API_URL = "http://localhost:5000/api/crop/analyze";
const ACCEPTED_TYPES = ["image/jpeg", "image/png"];
const MAX_MB = 8;
const REQUEST_TIMEOUT_MS = 60000;

const STATUS_MESSAGES = [
  "Uploading your photo",
  "Looking at leaf colour and texture",
  "Checking spots, edges and patterns",
  "Writing up what the leaf shows",
];

const CONDITION_LABELS = {
  disease: "Possible disease",
  pest: "Possible pest damage",
  nutrient_deficiency: "Possible nutrient deficiency",
  environmental_stress: "Possible weather or water stress",
  healthy: "Looks healthy",
  unknown: "Cause unclear",
};

const CONFIDENCE_LABELS = { low: "Low confidence", medium: "Medium confidence", high: "High confidence" };
const CONFIDENCE_STEPS = { low: 1, medium: 2, high: 3 };

const FALLBACK_DISCLAIMER =
  "This is an AI-generated estimate based on one photo, not a confirmed diagnosis. Please show the plant to a local agricultural expert before applying any treatment.";

/* ------------------------------------------------------------------ */
/* Small presentational pieces                                         */
/* ------------------------------------------------------------------ */

function LeafIcon() {
  return (
    <svg width="44" height="44" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M10 38C10 20 22 9 40 8c0 18-9 30-26 30"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path d="M10 38c6-10 13-17 22-22" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function BulletList({ items, variant }) {
  if (!items || items.length === 0) return null;
  return (
    <ul className={`cd-list ${variant || ""}`}>
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function ConfidenceMeter({ level }) {
  const filled = CONFIDENCE_STEPS[level] || 1;
  return (
    <div className="cd-meter" role="img" aria-label={CONFIDENCE_LABELS[level] || "Low confidence"}>
      <div className="cd-meter-bars">
        {[1, 2, 3].map((n) => (
          <span key={n} className={n <= filled ? "on" : ""} />
        ))}
      </div>
      <span className="cd-meter-label">{CONFIDENCE_LABELS[level] || "Low confidence"}</span>
    </div>
  );
}

function ResultView({ result, disclaimer }) {
  if (!result.isPlant) {
    return (
      <div className="cd-results">
        <section className="cd-card cd-verdict tone-neutral">
          <h2>This doesn&apos;t look like a crop or plant</h2>
          <p>{result.summary}</p>
        </section>
        {result.recommendedNextSteps.length > 0 && (
          <section className="cd-card">
            <h3>What to do next</h3>
            <BulletList items={result.recommendedNextSteps} />
          </section>
        )}
      </div>
    );
  }

  const type = result.condition.type;
  const tone = type === "healthy" ? "tone-good" : type === "unknown" ? "tone-neutral" : "tone-watch";
  const poorPhoto = result.imageQuality.rating !== "good" && result.imageQuality.note;

  return (
    <div className="cd-results">
      <section className={`cd-card cd-verdict ${tone}`}>
        <p className="cd-kind">
          {CONDITION_LABELS[type]}
          {result.cropName ? ` in ${result.cropName}` : ""}
        </p>
        <h2>{result.condition.name}</h2>
        {result.summary && <p>{result.summary}</p>}
        <ConfidenceMeter level={result.confidence.level} />
        {result.confidence.explanation && <p className="cd-muted">{result.confidence.explanation}</p>}
        {result.alternatives.length > 0 && (
          <p className="cd-muted">
            <strong>Other possibilities:</strong> {result.alternatives.join(", ")}
          </p>
        )}
      </section>

      {poorPhoto && (
        <section className="cd-card cd-photo-note" role="note">
          <h3>About this photo</h3>
          <p>{result.imageQuality.note}</p>
        </section>
      )}

      <div className="cd-two-col">
        {result.visibleSymptoms.length > 0 && (
          <section className="cd-card">
            <h3>What the leaf shows</h3>
            <BulletList items={result.visibleSymptoms} />
          </section>
        )}
        {result.possibleCauses.length > 0 && (
          <section className="cd-card">
            <h3>Possible causes</h3>
            <BulletList items={result.possibleCauses} />
          </section>
        )}
      </div>

      {result.recommendedNextSteps.length > 0 && (
        <section className="cd-card cd-steps">
          <h3>What to do next</h3>
          <ol className="cd-steps-list">
            {result.recommendedNextSteps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </section>
      )}

      {result.preventiveMeasures.length > 0 && (
        <section className="cd-card">
          <h3>How to prevent it</h3>
          <BulletList items={result.preventiveMeasures} variant="check" />
        </section>
      )}

      <section className="cd-card cd-expert" role="note">
        <h3>Check with an expert</h3>
        <p>{disclaimer || FALLBACK_DISCLAIMER}</p>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

function CropDoctor() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statusIndex, setStatusIndex] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [disclaimer, setDisclaimer] = useState("");

  const inputRef = useRef(null);
  const resultRef = useRef(null);
  const abortRef = useRef(null);

  // Create / revoke the preview URL.
  useEffect(() => {
    if (!file) {
      setPreviewUrl("");
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Rotate the loading messages.
  useEffect(() => {
    if (!loading) {
      setStatusIndex(0);
      return undefined;
    }
    const timer = setInterval(() => {
      setStatusIndex((i) => Math.min(i + 1, STATUS_MESSAGES.length - 1));
    }, 2500);
    return () => clearInterval(timer);
  }, [loading]);

  // Bring the result into view.
  useEffect(() => {
    if (result && resultRef.current) {
      resultRef.current.scrollIntoView({ block: "start" });
    }
  }, [result]);

  // Cancel any in-flight request on unmount.
  useEffect(() => () => abortRef.current && abortRef.current.abort(), []);

  const chooseFile = useCallback((picked) => {
    if (!picked) return;
    if (!ACCEPTED_TYPES.includes(picked.type)) {
      setError("Please choose a JPG, JPEG or PNG image.");
      return;
    }
    if (picked.size > MAX_MB * 1024 * 1024) {
      setError(`That image is larger than ${MAX_MB} MB. Please choose a smaller one.`);
      return;
    }
    if (abortRef.current) abortRef.current.abort();
    setLoading(false);
    setError("");
    setResult(null);
    setFile(picked);
  }, []);

  const handleInputChange = (e) => {
    chooseFile(e.target.files && e.target.files[0]);
    e.target.value = ""; // lets the same file be picked again
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    chooseFile(e.dataTransfer.files && e.dataTransfer.files[0]);
  };

  const reset = () => {
    if (abortRef.current) abortRef.current.abort();
    setLoading(false);
    setFile(null);
    setResult(null);
    setError("");
  };

  const analyze = async () => {
    if (!file || loading) return;

    setLoading(true);
    setError("");
    setResult(null);

    const controller = new AbortController();
    abortRef.current = controller;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const body = new FormData();
      body.append("image", file); // field name must be "image"

      const res = await fetch(API_URL, { method: "POST", body, signal: controller.signal });

      let data = null;
      try {
        data = await res.json();
      } catch {
        /* non-JSON response */
      }

      if (!res.ok || !data || !data.success) {
        throw new Error((data && data.error) || "The server couldn't analyze this image. Please try again.");
      }

      setResult(data.result);
      setDisclaimer(data.disclaimer || "");
    } catch (err) {
      if (err.name === "AbortError") {
        if (timedOut) setError("The analysis took too long. Please check your connection and try again.");
        return; // aborted on purpose (reset / new file)
      }
      if (err instanceof TypeError) {
        setError("Couldn't reach the Crop Doctor server. Check that the backend is running on port 5000.");
      } else {
        setError(err.message);
      }
    } finally {
      clearTimeout(timeout);
      if (abortRef.current === controller) setLoading(false);
    }
  };

  return (
    <div className="cd-root">
      <style>{STYLES}</style>

      <main className="cd-wrap">
        <header className="cd-header">
          <h1>Crop Doctor</h1>
          <p>
            Take a close photo of a leaf that looks wrong. Crop Doctor describes what it can see and suggests safe
            first steps.
          </p>
        </header>

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,image/jpeg,image/png"
          onChange={handleInputChange}
          className="cd-hidden"
          aria-label="Choose a crop photo"
          tabIndex={-1}
        />

        {!file ? (
          <button
            type="button"
            className={`cd-drop ${dragging ? "is-dragging" : ""}`}
            onClick={() => inputRef.current && inputRef.current.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <LeafIcon />
            <span className="cd-drop-title">Drop a leaf photo here</span>
            <span className="cd-drop-sub">or tap to choose one from your phone or computer</span>
            <span className="cd-drop-fine">JPG, JPEG or PNG, up to {MAX_MB} MB</span>
          </button>
        ) : (
          <section className="cd-stage" aria-label="Photo preview">
            <div className={`cd-frame ${loading ? "is-scanning" : ""}`}>
              <img src={previewUrl} alt="Your selected crop photo" />
              <span className="cd-corner tl" />
              <span className="cd-corner tr" />
              <span className="cd-corner bl" />
              <span className="cd-corner br" />
              {loading && <span className="cd-scan" aria-hidden="true" />}
            </div>

            <p className="cd-filename">{file.name}</p>

            <div className="cd-actions">
              <button type="button" className="cd-btn primary" onClick={analyze} disabled={loading}>
                {loading ? (
                  <>
                    <span className="cd-spinner" aria-hidden="true" />
                    Analyzing
                  </>
                ) : (
                  "Analyze Crop"
                )}
              </button>
              <button type="button" className="cd-btn ghost" onClick={reset}>
                Choose another photo
              </button>
            </div>

            <p className="cd-status" role="status" aria-live="polite">
              {loading ? `${STATUS_MESSAGES[statusIndex]}...` : ""}
            </p>
          </section>
        )}

        {!file && (
          <p className="cd-tip">
            For the best result, photograph one leaf in daylight, in focus, filling most of the frame.
          </p>
        )}

        {error && (
          <div className="cd-error" role="alert">
            <p>{error}</p>
            {file && !loading && (
              <button type="button" className="cd-btn small" onClick={analyze}>
                Try again
              </button>
            )}
          </div>
        )}

        <div ref={resultRef} className="cd-result-anchor">
          {result && <ResultView result={result} disclaimer={disclaimer} />}
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const STYLES = `
.cd-root {
  --ink: #1c2b22;
  --muted: #55685a;
  --paper: #f3f7f0;
  --card: #ffffff;
  --line: #d3e2d0;
  --leaf: #2e7d4f;
  --leaf-deep: #1f5a38;
  --leaf-soft: #e3f0e2;
  --turmeric: #d9a21b;
  --turmeric-soft: #fbf1d6;
  --rust: #b4432f;
  --rust-soft: #fbe9e5;
  --serif: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif;
  --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif;

  min-height: 100vh;
  padding: 40px 18px 80px;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--sans);
  line-height: 1.55;
  box-sizing: border-box;
}
.cd-root *, .cd-root *::before, .cd-root *::after { box-sizing: border-box; }
.cd-wrap { max-width: 820px; margin: 0 auto; }
.cd-hidden { display: none; }

.cd-header h1 {
  margin: 0 0 10px;
  font-family: var(--serif);
  font-size: clamp(2.1rem, 6vw, 3.2rem);
  line-height: 1.05;
  letter-spacing: -0.02em;
  color: var(--leaf-deep);
}
.cd-header p { margin: 0 0 28px; max-width: 54ch; color: var(--muted); font-size: 1.05rem; }

/* Upload zone */
.cd-drop {
  width: 100%;
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 52px 24px;
  background: var(--card);
  border: 2px dashed var(--leaf);
  border-radius: 18px;
  color: var(--leaf-deep);
  font: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.cd-drop:hover, .cd-drop.is-dragging { background: var(--leaf-soft); border-style: solid; }
.cd-drop-title { margin-top: 8px; font-family: var(--serif); font-size: 1.4rem; font-weight: 700; }
.cd-drop-sub { color: var(--ink); }
.cd-drop-fine { color: var(--muted); font-size: 0.88rem; }
.cd-tip { margin: 16px 2px 0; color: var(--muted); font-size: 0.95rem; }

/* Preview with scan frame */
.cd-stage { display: flex; flex-direction: column; align-items: center; }
.cd-frame {
  position: relative;
  width: 100%;
  background: #dfe9dc;
  border-radius: 6px;
  overflow: hidden;
}
.cd-frame img { display: block; width: 100%; max-height: 440px; object-fit: contain; }
.cd-corner { position: absolute; width: 30px; height: 30px; border: 0 solid var(--turmeric); pointer-events: none; }
.cd-corner.tl { top: 10px; left: 10px; border-top-width: 4px; border-left-width: 4px; }
.cd-corner.tr { top: 10px; right: 10px; border-top-width: 4px; border-right-width: 4px; }
.cd-corner.bl { bottom: 10px; left: 10px; border-bottom-width: 4px; border-left-width: 4px; }
.cd-corner.br { bottom: 10px; right: 10px; border-bottom-width: 4px; border-right-width: 4px; }

.cd-frame.is-scanning img { filter: saturate(0.85) brightness(0.92); }
.cd-scan {
  position: absolute; left: 0; right: 0; top: 0; height: 4px;
  background: var(--turmeric);
  box-shadow: 0 0 22px 8px rgba(217, 162, 27, 0.55);
  animation: cd-scan 2.2s ease-in-out infinite alternate;
}
@keyframes cd-scan { from { top: 0; } to { top: calc(100% - 4px); } }

.cd-filename { margin: 10px 0 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 0.9rem; }

.cd-actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px; margin-top: 18px; }
.cd-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 10px;
  min-height: 48px; padding: 0 26px;
  border-radius: 10px; border: 2px solid transparent;
  font: inherit; font-weight: 650; cursor: pointer;
  transition: background 0.15s, transform 0.1s;
}
.cd-btn.primary { background: var(--leaf); color: #fff; }
.cd-btn.primary:hover:not(:disabled) { background: var(--leaf-deep); }
.cd-btn.primary:disabled { opacity: 0.85; cursor: progress; }
.cd-btn.ghost { background: transparent; color: var(--leaf-deep); border-color: var(--line); }
.cd-btn.ghost:hover { background: var(--leaf-soft); }
.cd-btn.small { min-height: 38px; padding: 0 16px; background: var(--rust); color: #fff; }
.cd-btn:active:not(:disabled) { transform: translateY(1px); }
.cd-root button:focus-visible { outline: 3px solid var(--turmeric); outline-offset: 3px; }

.cd-spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.35); border-top-color: #fff;
  animation: cd-spin 0.8s linear infinite;
}
@keyframes cd-spin { to { transform: rotate(360deg); } }
.cd-status { min-height: 1.6em; margin: 12px 0 0; color: var(--leaf-deep); font-weight: 600; text-align: center; }

/* Error */
.cd-error {
  margin-top: 20px; padding: 14px 18px;
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px;
  background: var(--rust-soft); border-left: 5px solid var(--rust); border-radius: 8px;
}
.cd-error p { margin: 0; color: #7a2617; font-weight: 550; }

/* Results */
.cd-result-anchor { scroll-margin-top: 16px; }
.cd-results { display: flex; flex-direction: column; gap: 16px; margin-top: 32px; }
.cd-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 20px 22px; }
.cd-card h3 { margin: 0 0 10px; font-family: var(--serif); font-size: 1.2rem; color: var(--leaf-deep); }
.cd-card p { margin: 0 0 10px; }
.cd-card p:last-child { margin-bottom: 0; }
.cd-muted { color: var(--muted); font-size: 0.95rem; }

.cd-verdict { border-left-width: 8px; padding: 24px 24px 22px; }
.cd-verdict h2 { margin: 0 0 10px; font-family: var(--serif); font-size: clamp(1.6rem, 4.5vw, 2.2rem); line-height: 1.15; }
.cd-verdict .cd-kind { margin: 0 0 4px; font-weight: 650; color: var(--muted); }
.cd-verdict.tone-good { border-left-color: var(--leaf); background: #f6fbf4; }
.cd-verdict.tone-watch { border-left-color: var(--turmeric); background: #fffbef; }
.cd-verdict.tone-neutral { border-left-color: #8a9a8e; }

.cd-meter { display: flex; align-items: center; gap: 12px; margin: 14px 0 8px; }
.cd-meter-bars { display: flex; gap: 5px; }
.cd-meter-bars span { width: 34px; height: 9px; border-radius: 5px; background: #d9e3d6; }
.cd-meter-bars span.on { background: var(--leaf); }
.cd-meter-label { font-weight: 650; font-size: 0.95rem; }

.cd-photo-note { background: var(--turmeric-soft); border-color: #ecd58f; }
.cd-two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

.cd-list { margin: 0; padding-left: 1.2em; }
.cd-list li { margin-bottom: 7px; }
.cd-list li::marker { color: var(--leaf); }
.cd-list.check { list-style: none; padding-left: 0; }
.cd-list.check li { position: relative; padding-left: 28px; }
.cd-list.check li::before {
  content: ""; position: absolute; left: 4px; top: 0.35em;
  width: 7px; height: 12px;
  border: solid var(--leaf); border-width: 0 3px 3px 0; transform: rotate(40deg);
}

.cd-steps-list { margin: 0; padding: 0; list-style: none; counter-reset: step; }
.cd-steps-list li { position: relative; counter-increment: step; padding: 2px 0 14px 46px; }
.cd-steps-list li::before {
  content: counter(step);
  position: absolute; left: 0; top: 0;
  width: 32px; height: 32px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: var(--leaf); color: #fff; font-weight: 700; font-size: 0.95rem;
}
.cd-steps-list li:not(:last-child)::after {
  content: ""; position: absolute; left: 15px; top: 34px; bottom: 2px; width: 2px; background: var(--line);
}

.cd-expert { background: var(--leaf-soft); border-color: #b9d4b8; }

@media (max-width: 640px) {
  .cd-root { padding: 28px 14px 64px; }
  .cd-two-col { grid-template-columns: 1fr; }
  .cd-drop { padding: 40px 18px; }
  .cd-btn { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .cd-scan { animation: none; top: 45%; }
  .cd-spinner { animation-duration: 2s; }
  .cd-btn, .cd-drop { transition: none; }
}
`;

export default CropDoctor;
