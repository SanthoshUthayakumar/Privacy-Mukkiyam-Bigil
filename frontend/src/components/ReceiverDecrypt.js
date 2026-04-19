import { useState, useRef } from "react";

const BACKEND   = "http://localhost:5000";
const MAX_TRIES = 3;
const LOCK_SECS = 30;

export default function ReceiverDecrypt({ onSwitchToEncrypt }) {
  const [imgFile,      setImgFile]      = useState(null);
  const [metaFile,     setMetaFile]     = useState(null);
  const [imgPreview,   setImgPreview]   = useState(null);
  const [key,          setKey]          = useState("");
  const [showKey,      setShowKey]      = useState(false);
  const [restoredSrc,  setRestoredSrc]  = useState(null);
  const [totalRegions, setTotalRegions] = useState(0);
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_TRIES);
  const [countdown,    setCountdown]    = useState(0);
  const [locked,       setLocked]       = useState(false);
  const [errMsg,       setErrMsg]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [dragImg,      setDragImg]      = useState(false);
  const [dragMeta,     setDragMeta]     = useState(false);
  const [done,         setDone]         = useState(false);

  const timerRef    = useRef(null);
  const imgInputRef  = useRef();
  const metaInputRef = useRef();

  const handleImgFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setErrMsg("Please upload an image file (PNG, JPG)."); return; }
    setImgFile(file);
    setImgPreview(URL.createObjectURL(file));
    setErrMsg("");
  };

  const handleMetaFile = (file) => {
    if (!file) return;
    if (!file.name.endsWith(".json")) { setErrMsg("Please upload the _meta.json file."); return; }
    setMetaFile(file);
    setErrMsg("");
  };

  const bothReady = imgFile && metaFile;

  const startLockout = (secs) => {
    setLocked(true); setCountdown(secs); setAttemptsLeft(0);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          setLocked(false); setAttemptsLeft(MAX_TRIES); return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleDecrypt = async () => {
    if (!bothReady || !key.trim() || locked) return;
    setLoading(true); setErrMsg("");
    const fd = new FormData();
    fd.append("redacted_image", imgFile);
    fd.append("meta_json",      metaFile);
    fd.append("secret_key",     key);
    try {
      const res  = await fetch(`${BACKEND}/decrypt_upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (data.ok) {
        setRestoredSrc(`data:${data.mime};base64,${data.image_b64}`);
        setTotalRegions(data.total_regions);
        setDone(true);
      } else if (data.reason === "locked_out") {
        startLockout(data.wait_seconds || LOCK_SECS);
        setErrMsg(`Too many wrong attempts. Locked for ${data.wait_seconds || LOCK_SECS}s.`);
      } else if (data.reason === "wrong_key") {
        const left = data.attempts_left ?? attemptsLeft - 1;
        setAttemptsLeft(Math.max(0, left));
        setErrMsg(left > 0
          ? `❌ Incorrect key. ${left} attempt${left !== 1 ? "s" : ""} remaining.`
          : "No attempts remaining. Wait for lockout.");
      } else if (data.reason === "invalid_meta_file") {
        setErrMsg("The meta .json file is invalid or corrupted.");
      } else {
        setErrMsg(`Error: ${data.reason || "Unknown error. Check server."}`);
      }
    } catch (e) {
      setErrMsg("Cannot reach server. Make sure backend is running on port 5000.");
    } finally {
      setLoading(false);
    }
  };

  const downloadRestored = () => {
    const a = document.createElement("a");
    a.href = restoredSrc;
    a.download = `restored_${imgFile?.name || "image"}.png`;
    a.click();
  };

  const reset = () => {
    setImgFile(null); setMetaFile(null); setImgPreview(null);
    setKey(""); setDone(false); setRestoredSrc(null);
    setErrMsg(""); setAttemptsLeft(MAX_TRIES);
    setLocked(false); setCountdown(0);
    clearInterval(timerRef.current);
  };

  // ── SUCCESS STATE ──────────────────────────────────────────────────────────
  if (done && restoredSrc) {
    return (
      <section className="section recv-inline" style={{ marginTop: 20 }}>
        <div className="recv-success-inline">
          <div className="recv-success-banner">
            <span className="recv-success-icon">✓</span>
            <div>
              <p className="recv-success-title">Image decrypted successfully!</p>
              <p className="recv-success-sub">
                {totalRegions} encrypted region{totalRegions !== 1 ? "s" : ""} restored.
              </p>
            </div>
          </div>

          <div className="recv-compare">
            <div className="recv-compare-col">
              <p className="recv-compare-label">Received (encrypted)</p>
              <img src={imgPreview} alt="Encrypted" className="recv-compare-img" />
            </div>
            <div className="recv-compare-arrow">→</div>
            <div className="recv-compare-col">
              <p className="recv-compare-label recv-compare-label-green">Restored</p>
              <img src={restoredSrc} alt="Restored" className="recv-compare-img" />
            </div>
          </div>

          <div className="action-bar">
            <button className="btn-secondary" onClick={reset}>🔄 Decrypt Another</button>
            <button className="btn-primary" onClick={downloadRestored}>
              ⬇ Download Restored Image
            </button>
          </div>

          <p className="recv-notice">
            ⚠ Do not forward without the sender's permission.
          </p>
        </div>
      </section>
    );
  }

  // ── FORM STATE ─────────────────────────────────────────────────────────────
  return (
    <section className="section recv-inline" style={{ marginTop: 20 }}>

      {/* How it works */}
      <div className="recv-how-inline">
        <div className="recv-how-step">
          <span className="recv-how-num">1</span>
          <span>Upload the black-box image you received</span>
        </div>
        <span className="recv-how-arrow">→</span>
        <div className="recv-how-step">
          <span className="recv-how-num">2</span>
          <span>Upload the <code style={{ fontFamily: "monospace", fontSize: "0.85em" }}>_meta.json</code> file</span>
        </div>
        <span className="recv-how-arrow">→</span>
        <div className="recv-how-step">
          <span className="recv-how-num">3</span>
          <span>Enter the key the sender shared with you</span>
        </div>
      </div>

      <div className="recv-form-inline">

        {/* File 1: Image */}
        <div className="recv-file-row">
          <div className="recv-file-block">
            <p className="recv-file-label-inline">
              <span className="recv-file-num">1</span>
              Redacted Image
              <span className="recv-file-hint">(black boxes image)</span>
            </p>
            <div
              className={`recv-drop-inline ${dragImg ? "recv-drop-active" : ""} ${imgFile ? "recv-drop-done" : ""}`}
              onClick={() => imgInputRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDragImg(true); }}
              onDragLeave={() => setDragImg(false)}
              onDrop={(e) => { e.preventDefault(); setDragImg(false); handleImgFile(e.dataTransfer.files[0]); }}
            >
              <input ref={imgInputRef} type="file" accept="image/*"
                style={{ display: "none" }} onChange={(e) => handleImgFile(e.target.files[0])} />
              {imgFile ? (
                <div className="recv-drop-done-content">
                  <img src={imgPreview} alt="preview" className="recv-thumb" />
                  <div className="recv-drop-file-info">
                    <p className="recv-drop-filename">{imgFile.name}</p>
                    <p className="recv-drop-filesize">{(imgFile.size / 1024).toFixed(1)} KB</p>
                    <button className="recv-drop-change"
                      onClick={(e) => { e.stopPropagation(); setImgFile(null); setImgPreview(null); }}>
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div className="recv-drop-placeholder">
                  <div className="recv-drop-icon">🖼</div>
                  <p className="recv-drop-text">Drop or click to upload image</p>
                  <p className="recv-drop-sub">PNG · JPG · JPEG</p>
                </div>
              )}
            </div>
          </div>

          {/* File 2: Meta JSON */}
          <div className="recv-file-block">
            <p className="recv-file-label-inline">
              <span className="recv-file-num recv-file-num-blue">2</span>
              Metadata File
              <span className="recv-file-hint">(_meta.json)</span>
            </p>
            <div
              className={`recv-drop-inline recv-drop-inline-meta ${dragMeta ? "recv-drop-active" : ""} ${metaFile ? "recv-drop-done" : ""}`}
              onClick={() => metaInputRef.current.click()}
              onDragOver={(e) => { e.preventDefault(); setDragMeta(true); }}
              onDragLeave={() => setDragMeta(false)}
              onDrop={(e) => { e.preventDefault(); setDragMeta(false); handleMetaFile(e.dataTransfer.files[0]); }}
            >
              <input ref={metaInputRef} type="file" accept=".json"
                style={{ display: "none" }} onChange={(e) => handleMetaFile(e.target.files[0])} />
              {metaFile ? (
                <div className="recv-drop-done-content">
                  <div className="recv-json-icon">{ }</div>
                  <div className="recv-drop-file-info">
                    <p className="recv-drop-filename">{metaFile.name}</p>
                    <p className="recv-drop-filesize">{(metaFile.size / 1024).toFixed(1)} KB</p>
                    <button className="recv-drop-change"
                      onClick={(e) => { e.stopPropagation(); setMetaFile(null); }}>
                      Change
                    </button>
                  </div>
                </div>
              ) : (
                <div className="recv-drop-placeholder">
                  <div className="recv-drop-icon">📄</div>
                  <p className="recv-drop-text">Drop or click to upload JSON</p>
                  <p className="recv-drop-sub">JSON file only</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Key input */}
        <div className="recv-key-section">
          <p className="recv-file-label-inline">
            <span className="recv-file-num recv-file-num-teal">3</span>
            Decryption Key
            <span className="recv-file-hint">(ask the sender — never stored here)</span>
          </p>

          {/* Attempt indicator */}
          <div className="recv-attempts">
            {[...Array(MAX_TRIES)].map((_, i) => (
              <div key={i} className="recv-attempt-dot" style={{
                background: locked
                  ? "rgba(249,168,37,0.5)"
                  : i < attemptsLeft
                    ? "rgba(0,201,167,0.65)"
                    : "rgba(255,107,107,0.35)",
              }} />
            ))}
            <span className="recv-attempt-label">
              {locked ? `🔒 Locked for ${countdown}s` : `${attemptsLeft}/${MAX_TRIES} attempts left`}
            </span>
          </div>

          <div className="recv-key-wrap">
            <input
              className="recv-key-input"
              type={showKey ? "text" : "password"}
              placeholder="Enter the decryption key..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !locked && handleDecrypt()}
              disabled={locked || loading}
              autoComplete="off"
            />
            <button className="recv-key-show" onClick={() => setShowKey(!showKey)}
              disabled={locked} tabIndex={-1}>
              {showKey ? "Hide" : "Show"}
            </button>
          </div>

          {locked && (
            <div className="recv-lockout-bar">
              <div className="recv-lockout-fill"
                style={{ width: `${(countdown / LOCK_SECS) * 100}%` }} />
            </div>
          )}
        </div>

        {/* Error */}
        {errMsg && (
          <div className="recv-error">
            <span>⚠</span> {errMsg}
          </div>
        )}

        {/* Decrypt button */}
        <button
          className="btn-primary recv-decrypt-btn"
          onClick={handleDecrypt}
          disabled={!bothReady || !key.trim() || locked || loading}
        >
          {loading ? (
            <><span className="spinner" /> Decrypting...</>
          ) : locked ? (
            `🔒 Locked (${countdown}s)`
          ) : (
            "🔓 Decrypt & Restore Image"
          )}
        </button>

        {/* Security notes */}
        <div className="recv-security-note">
          <div className="recv-security-row"><span>🔐</span><span>AES-256-GCM decryption — only correct key works</span></div>
          <div className="recv-security-row"><span>🗑</span><span>Uploaded files deleted from server immediately after decryption</span></div>
          <div className="recv-security-row"><span>🚫</span><span>Wrong key rate-limited: max {MAX_TRIES} tries / {LOCK_SECS}s lockout</span></div>
          <div className="recv-security-row"><span>📄</span><span>Meta file is useless without the correct key</span></div>
        </div>

      </div>
    </section>
  );
}