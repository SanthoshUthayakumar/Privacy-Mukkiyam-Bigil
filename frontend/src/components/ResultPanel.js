import MetadataPanel from "./MetadataPanel";
import DecryptPanel  from "./DecryptPanel";

const BACKEND = "http://localhost:5000";

export default function ResultPanel({ result, onReset }) {
  const {
    boxes = [], output_url, original_url, meta_url,
    total_redactions, total_encrypted, key_hash,
    backend = BACKEND, metadata,
  } = result;

  const labelCounts = boxes.reduce((acc, b) => {
    const k = b.display_label || b.label;
    acc[k]  = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const dl = (url, name) => {
    const a = document.createElement("a");
    a.href     = `${backend}${url}`;
    a.download = name;
    a.click();
  };

  return (
    <div className="result-wrap">

      {/* ── Stats ── */}
      <div className="result-stats">
        <div className="stat-card big">
          <span className="stat-num">{total_redactions}</span>
          <span className="stat-label">Regions Detected</span>
        </div>
        <div className="stat-card big" style={{
          borderColor: "rgba(124,92,232,0.4)",
          background:  "rgba(124,92,232,0.07)",
        }}>
          <span className="stat-num" style={{ color: "var(--violet)" }}>
            {total_encrypted}
          </span>
          <span className="stat-label">AES Encrypted</span>
        </div>
        <div className="stat-card big" style={{
          borderColor: metadata?.has_gps ? "rgba(255,107,107,0.4)" : "rgba(0,201,167,0.3)",
          background:  metadata?.has_gps ? "rgba(255,107,107,0.07)" : "rgba(0,201,167,0.06)",
        }}>
          <span className="stat-num" style={{ color: metadata?.has_gps ? "var(--coral)" : "var(--teal)" }}>
            YES
          </span>
          <span className="stat-label">Meta Stripped</span>
        </div>
        {Object.entries(labelCounts).map(([label, count]) => (
          <div key={label} className="stat-card">
            <span className="stat-num">{count}</span>
            <span className="stat-label">{label}</span>
          </div>
        ))}
      </div>

      {/* ── AES info badge ── */}
      <div className="aes-info-bar">
        <span className="aes-badge">🔐 AES-256-GCM</span>
        <span className="aes-badge">🛡 PBKDF2 Key Derivation</span>
        <span className="aes-badge">✓ Metadata Stripped</span>
        <span className="aes-badge">📄 Encrypted Metadata Saved</span>
        {key_hash && (
          <span className="aes-badge aes-hash">Key hash: {key_hash}</span>
        )}
      </div>

      {/* ── Comparison ── */}
      <div className="result-compare">
        <div className="compare-panel">
          <div className="compare-label">Original</div>
          <img src={`${backend}${original_url}`} alt="Original" className="compare-img" />
        </div>
        <div className="compare-divider">→</div>
        <div className="compare-panel">
          <div className="compare-label redacted-label">
            AES Redacted (Black Boxes)
          </div>
          <img
            src={`${backend}${output_url}?t=${Date.now()}`}
            alt="Redacted"
            className="compare-img"
          />
          <p className="compare-note">
            Safe to share — sensitive data is AES-encrypted, not just blurred
          </p>
        </div>
      </div>

      {/* ── Metadata panel ── */}
      {metadata && (
        <section className="section" style={{ marginTop: 20 }}>
          <h2 className="section-title">
            <span className="accent">05</span> Metadata Analysis
          </h2>
          <MetadataPanel
            metadata={metadata}
            stripEnabled={true}
            onToggleStrip={null}
          />
        </section>
      )}

      {/* ── Decrypt panel ── */}
      <section className="section" style={{ marginTop: 20 }}>
        <h2 className="section-title">
          <span className="accent">06</span> Decrypt & Restore
        </h2>
        <DecryptPanel result={result} backend={backend} />
      </section>

      {/* ── Detection log ── */}
      {boxes.length > 0 && (
        <div className="result-table-wrap" style={{ marginTop: 20 }}>
          <h3 className="result-table-title">Detection Log ({boxes.length})</h3>
          <div className="table-scroll">
            <table className="result-table">
              <thead>
                <tr>
                  <th>#</th><th>Type</th><th>Value Detected</th>
                  <th>Position</th><th>Size</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {boxes.map((box, i) => (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>
                      <span className={`tag tag-${box.label}`}>
                        {box.display_label || box.label}
                      </span>
                    </td>
                    <td className="mono redacted-val">{box.value || "—"}</td>
                    <td className="mono">({box.x}, {box.y})</td>
                    <td className="mono">{box.w}×{box.h}</td>
                    <td>
                      <span className="tag" style={{
                        background: "rgba(124,92,232,0.1)", color: "var(--violet)",
                      }}>
                        🔐 Encrypted
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Actions ── */}
      <div className="action-bar">
        <button className="btn-secondary" onClick={onReset}>← New Image</button>
        <button
          className="btn-secondary"
          onClick={() => dl(meta_url, `redact_meta_${result.id?.slice(0,8)}.json`)}
        >
          📄 Download Meta JSON
        </button>
        <a
          href="/decrypt"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary"
          style={{ textDecoration: "none", display: "inline-flex", alignItems: "center" }}
        >
          🔓 Receiver Decrypt Page
        </a>
        <button
          className="btn-primary"
          onClick={() => dl(output_url, `redacted_${result.id?.slice(0,8)}.png`)}
        >
        Download Redacted Image
        </button>
      </div>

      
    </div>
  );
}