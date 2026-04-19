import { useState } from "react";

export default function KeyPanel({ secretKey, onChange }) {
  const [show, setShow] = useState(false);

  const strength = (() => {
    const k = secretKey;
    if (!k)          return { level: 0, label: "",         color: "transparent" };
    if (k.length < 6) return { level: 1, label: "Too short", color: "#ff6b6b" };
    if (k.length < 10) return { level: 2, label: "Weak",    color: "#f9a825" };
    const hasUpper = /[A-Z]/.test(k);
    const hasNum   = /\d/.test(k);
    const hasSym   = /[^A-Za-z0-9]/.test(k);
    const score    = [k.length >= 12, hasUpper, hasNum, hasSym].filter(Boolean).length;
    if (score <= 1) return { level: 2, label: "Weak",   color: "#f9a825" };
    if (score === 2) return { level: 3, label: "Fair",   color: "#d4b83a" };
    if (score === 3) return { level: 4, label: "Strong", color: "#00c9a7" };
    return           { level: 5, label: "Very Strong",   color: "#7c5ce8" };
  })();

  return (
    <div className="key-panel">
      <div className="key-panel-header">
        <span className="key-panel-icon">🔑</span>
        <div>
          <p className="key-panel-title">Set Encryption Key</p>
          <p className="key-panel-sub">
            Used to AES-256 encrypt sensitive regions.
            <strong> Keep this safe — required to decrypt later.</strong>
          </p>
        </div>
      </div>

      <div className="key-input-wrap">
        <input
          className="key-input"
          type={show ? "text" : "password"}
          placeholder="Enter secret key (min. 6 characters)..."
          value={secretKey}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="new-password"
        />
        <button
          className="key-show-btn"
          onClick={() => setShow(!show)}
          tabIndex={-1}
          type="button"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>

      {/* Strength bar */}
      {secretKey.length > 0 && (
        <div className="key-strength">
          <div className="key-strength-bar">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="key-strength-seg"
                style={{
                  background: i <= strength.level ? strength.color : "rgba(0,0,0,0.08)",
                }}
              />
            ))}
          </div>
          <span className="key-strength-label" style={{ color: strength.color }}>
            {strength.label}
          </span>
        </div>
      )}

      {/* Info points */}
      <div className="key-info-list">
        <span className="key-info-item">🔐 AES-256-GCM encryption per region</span>
        <span className="key-info-item">🛡 Only SHA-256 hash is stored, never raw key</span>
        <span className="key-info-item">🚫 Max 3 wrong attempts before 30s lockout</span>
        <span className="key-info-item">📄 Encrypted metadata saved with redacted image</span>
      </div>
    </div>
  );
}