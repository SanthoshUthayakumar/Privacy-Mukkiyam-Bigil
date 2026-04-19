import { useState, useCallback } from "react";
import "./App.css";
import UploadZone      from "./components/UploadZone";
import TogglePanel     from "./components/TogglePanel";
import ImagePreview    from "./components/ImagePreview";
import ManualRedaction from "./components/ManualRedaction";
import ResultPanel     from "./components/ResultPanel";
import KeyPanel        from "./components/KeyPanel";
import ReceiverDecrypt from "./components/ReceiverDecrypt";

const BACKEND = "http://localhost:5000";

const DEFAULT_FILTERS = {
  aadhaar: true, pan: true, id_card: true,
  payment: true, face: true, object: false,
  email: true,  phone: true, password: true,
  dob: true,    pincode: false,
};

const INITIAL_STATE = {
  image:       null,
  imageURL:    null,
  filters:     DEFAULT_FILTERS,
  manualBoxes: [],
  secretKey:   "",
  result:      null,
  loading:     false,
  error:       null,
  step:        "upload",
  sessionKey:  0,
};

export default function App() {
  const [mode,  setMode]  = useState("encrypt");
  const [state, setState] = useState(INITIAL_STATE);
  const set = (patch) => setState((s) => ({ ...s, ...patch }));

  const handleReset = useCallback(() => {
    setState((prev) => {
      if (prev.imageURL) URL.revokeObjectURL(prev.imageURL);
      return { ...INITIAL_STATE, sessionKey: prev.sessionKey + 1 };
    });
  }, []);

  const switchMode = (m) => { setMode(m); handleReset(); };

  const handleImageSelect = (file) => {
    if (state.imageURL) URL.revokeObjectURL(state.imageURL);
    set({ image: file, imageURL: URL.createObjectURL(file),
          result: null, manualBoxes: [], error: null, step: "preview" });
  };

  const handleProcess = async () => {
    if (!state.image) return;
    if (!state.secretKey || state.secretKey.length < 6) {
      set({ error: "Set a secret key (min 6 characters) before encrypting." });
      return;
    }
    set({ loading: true, error: null });
    try {
      const fd = new FormData();
      fd.append("image",        state.image);
      fd.append("filters",      JSON.stringify(state.filters));
      fd.append("manual_boxes", JSON.stringify(state.manualBoxes));
      fd.append("secret_key",   state.secretKey);
      const res  = await fetch(`${BACKEND}/process`, { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json().catch(()=>({})); throw new Error(e.error||`Error ${res.status}`); }
      const data = await res.json();
      set({ result: { ...data, backend: BACKEND }, step: "result", loading: false });
    } catch (e) { set({ error: e.message, loading: false }); }
  };

  const {  imageURL, filters, manualBoxes, secretKey,
          result, loading, error, step, sessionKey } = state;

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="header">
        <div className="header-inner">
          <div className="logo">
            <span className="logo-mark">PMB</span>
            <span className="logo-text">PRIVACY-<span className="logo-accent">MUKKIYAM</span><span className="logo-text">-BIGILLL !</span></span>
          </div>
          <div className="header-right">
            <div className="header-tags">
              <span className="htag">UN PRIVACY UN KAIYIL</span>
              <span className="htag">DATA THIRUDARGAL JAKKIRATHAI</span>
            </div>
          </div>
        </div>
      </header>

      <main className="main">

        {/* ══════════════════════════════════════
            PILL TOGGLE — always visible at top
        ══════════════════════════════════════ */}
        <div className="mode-wrapper">
          <div className="mode-pill">
            {/* sliding highlight */}
            <div className={`mode-pill-slider ${mode === "decrypt" ? "mode-pill-slider-right" : ""}`} />

            <button
              className={`mode-pill-btn ${mode === "encrypt" ? "mode-pill-btn-active" : ""}`}
              onClick={() => switchMode("encrypt")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mode-icon">
                <rect x="2" y="7" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              Encrypt Image
            </button>

            <button
              className={`mode-pill-btn ${mode === "decrypt" ? "mode-pill-btn-active" : ""}`}
              onClick={() => switchMode("decrypt")}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="mode-icon">
                <rect x="2" y="7" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M5 7V5a3 3 0 0 1 5.83-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                <path d="M11 7V5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 1.5"/>
              </svg>
              Decrypt Image
            </button>
          </div>

          {/* context label under toggle */}
          <p className="mode-context">
            {mode === "encrypt"
              ? "Detect sensitive regions · AES-encrypt · share safely"
              : "Upload encrypted image + meta file · enter key · restore"}
          </p>
        </div>

        {/* ══ DECRYPT MODE ══ */}
        {mode === "decrypt" && (
          <ReceiverDecrypt inline onSwitchToEncrypt={() => switchMode("encrypt")} />
        )}

        {/* ══ ENCRYPT MODE ══ */}
        {mode === "encrypt" && (
          <>
            {/* Progress steps */}
            {step !== "upload" && (
              <div className="steps">
                {["upload","preview","result"].map((s,i) => (
                  <div key={s} className={`step ${step===s?"active":""} ${
                    (step==="preview"&&i===0)||(step==="result"&&i<2)?"done":""
                  }`}>
                    <span className="step-num">{i+1}</span>
                    <span className="step-label">{s.toUpperCase()}</span>
                  </div>
                ))}
                <button className="refresh-btn" onClick={handleReset}>
                  <svg width="13" height="13" viewBox="0 0 15 15" fill="none">
                    <path d="M13 7.5A5.5 5.5 0 1 1 7.5 2a5.5 5.5 0 0 1 4 1.72"
                      stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                    <path d="M10 1v3H7" stroke="currentColor" strokeWidth="1.6"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Reset
                </button>
              </div>
            )}

            {error && (
              <div className="error-banner">
                <span className="error-icon">!</span> {error}
                <button className="error-dismiss" onClick={() => set({ error: null })}>✕</button>
              </div>
            )}

            {/* UPLOAD */}
            {step === "upload" && (
              <section className="section">
                <div className="section-title-row">
                  <span className="section-num">01</span>
                  <h2 className="section-heading">Upload or Capture Image</h2>
                </div>
                <p className="section-hint">
                  Aadhaar cards · PAN cards · credit/debit cards · passports ·
                  driving licences · voter IDs · UPI payment screenshots.
                  -safe to share.
                </p>
                <UploadZone key={sessionKey} onSelect={handleImageSelect} />
              </section>
            )}

            {/* PREVIEW */}
            {step === "preview" && imageURL && (
              <>
                <section className="section">
                  <div className="section-title-row">
                    <span className="section-num">02</span>
                    <h2 className="section-heading">Set Encryption Key</h2>
                  </div>
                  <KeyPanel secretKey={secretKey} onChange={(k) => set({ secretKey: k })} />
                </section>

                <div className="two-col">
                  <section className="section">
                    <div className="section-title-row">
                      <span className="section-num">03</span>
                      <h2 className="section-heading">Detection Filters</h2>
                    </div>
                    <TogglePanel filters={filters} onChange={(f) => set({ filters: f })} />
                  </section>
                  <section className="section">
                    <div className="section-title-row">
                      <span className="section-num">04</span>
                      <h2 className="section-heading">Image Preview</h2>
                    </div>
                    <ImagePreview imageURL={imageURL} boxes={result?.boxes||[]} />
                  </section>
                </div>

                <section className="section">
                  <div className="section-title-row">
                    <span className="section-num">05</span>
                    <h2 className="section-heading">Manual Redaction</h2>
                  </div>
                  <p className="section-hint">Drag to draw boxes over any area the AI missed.</p>
                  <ManualRedaction
                    key={sessionKey}
                    imageURL={imageURL}
                    manualBoxes={manualBoxes}
                    onChange={(b) => set({ manualBoxes: b })}
                  />
                </section>

                <div className="action-bar">
                  <button className="btn-ghost" onClick={handleReset}>← New Image</button>
                  <button
                    className="btn-primary"
                    onClick={handleProcess}
                    disabled={loading || !secretKey || secretKey.length < 6}
                  >
                    {loading
                      ? <><span className="spinner"/>Encrypting…</>
                      : <>
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                            <rect x="2" y="7" width="12" height="8" rx="2" stroke="currentColor" strokeWidth="1.7"/>
                            <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
                          </svg>
                          Detect &amp; Encrypt
                        </>
                    }
                  </button>
                </div>
              </>
            )}

            {/* RESULT */}
            {step === "result" && result && (
              <ResultPanel result={result} onReset={handleReset} />
            )}
          </>
        )}
      </main>
    </div>
  );
}