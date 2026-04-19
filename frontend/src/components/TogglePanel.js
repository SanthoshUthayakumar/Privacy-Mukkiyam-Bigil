const FILTER_META = {

  // ── Indian Government IDs ─────────────────────────────────────────────────
  aadhaar: {
    icon: "🪪", label: "Aadhaar Card",
    desc: "12-digit UID number only",
    color: "#e05c5c", group: "govt",
    covers: ["Aadhaar number", "masked Aadhaar"],
  },
  pan: {
    icon: "💼", label: "PAN Card",
    desc: "10-char PAN value only",
    color: "#e07d2a", group: "govt",
    covers: ["PAN number"],
  },
  id_card: {
    icon: "🎓", label: "ID Cards (School / College / Govt)",
    desc: "Roll No · Reg No · Voter ID · DL · Passport · Employee ID · Library ID",
    color: "#d4a843", group: "govt",
    covers: ["Roll number", "Reg number", "Voter ID", "DL", "Passport", "Employee ID", "Library ID", "Student name", "Dept", "Batch"],
  },

  // ── Credit / Debit / Payment ──────────────────────────────────────────────
  payment: {
    icon: "💳", label: "Payment & Cards",
    desc: "Card No · Expiry · CVV · UPI · IFSC · Txn ID · Amount",
    color: "#5a9ecc", group: "payment",
    covers: ["Card number (Luhn-validated)", "Expiry MM/YY", "CVV digits", "UPI ID", "IFSC", "Account No", "Txn ID", "₹ Amount"],
  },

  // ── Biometric ─────────────────────────────────────────────────────────────
  face: {
    icon: "👤", label: "Face Detection",
    desc: "OpenCV Haar Cascade",
    color: "#9b72e8", group: "bio",
    covers: ["Faces in photo"],
  },
  object: {
    icon: "📦", label: "YOLO Detection",
    desc: "Custom trained model (optional)",
    color: "#5ab06e", group: "bio",
    covers: ["Custom trained classes"],
  },

  // ── Personal Info ─────────────────────────────────────────────────────────
  email: {
    icon: "✉",  label: "Email Addresses",
    desc: "user@domain.com values only",
    color: "#5ab06e", group: "pii",
    covers: ["Email addresses"],
  },
  phone: {
    icon: "📞", label: "Phone Numbers",
    desc: "Indian (+91) & international",
    color: "#4ecdc4", group: "pii",
    covers: ["Mobile numbers"],
  },
  dob: {
    icon: "📅", label: "Date of Birth",
    desc: "DD/MM/YYYY value only",
    color: "#d4b83a", group: "pii",
    covers: ["DOB values"],
  },
  password: {
    icon: "🔑", label: "Passwords / OTPs",
    desc: "Value after 'password:' or 'OTP:' label",
    color: "#e05c5c", group: "pii",
    covers: ["Password values", "OTP digits"],
  },
  pincode: {
    icon: "📍", label: "Pincode",
    desc: "6-digit PIN after 'Pin Code:' label",
    color: "#a8a8a8", group: "pii",
    covers: ["Indian PIN codes"],
  },
};

const GROUPS = [
  { key: "govt",    label: "🪪 Government & Institution IDs" },
  { key: "payment", label: "💳 Payment & Cards" },
  { key: "bio",     label: "👁 Biometric" },
  { key: "pii",     label: "🔒 Personal Information" },
];

export default function TogglePanel({ filters, onChange }) {
  const toggle   = (key) => onChange({ ...filters, [key]: !filters[key] });
  const enableAll  = () => {
    const all = {};
    Object.keys(FILTER_META).forEach((k) => (all[k] = true));
    onChange(all);
  };
  const disableAll = () => {
    const none = {};
    Object.keys(FILTER_META).forEach((k) => (none[k] = false));
    onChange(none);
  };

  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="toggle-panel">

      {/* Header */}
      <div className="toggle-header">
        <div className="toggle-summary">
          <span className="toggle-count">{activeCount}</span>
          <span className="toggle-count-label">/ {Object.keys(FILTER_META).length} active</span>
        </div>
        <div className="toggle-quick">
          <button className="quick-btn" onClick={enableAll}>All ON</button>
          <button className="quick-btn" onClick={disableAll}>All OFF</button>
        </div>
      </div>

      {/* Value-only notice */}
      <div className="toggle-notice">
        ⬛ Only sensitive <strong>values</strong> are masked — labels like "Roll No:" or "Expiry:" are kept visible.
      </div>

      {/* Groups */}
      {GROUPS.map((group) => {
        const entries = Object.entries(FILTER_META).filter(([, m]) => m.group === group.key);
        return (
          <div key={group.key} className="toggle-group">
            <p className="toggle-group-label">{group.label}</p>
            <div className="toggle-grid">
              {entries.map(([key, meta]) => (
                <button
                  key={key}
                  className={`toggle-card ${filters[key] ? "on" : "off"}`}
                  onClick={() => toggle(key)}
                  style={{ "--accent": meta.color }}
                >
                  <div className="toggle-card-top">
                    <span className="toggle-icon">{meta.icon}</span>
                    <div className={`toggle-pill ${filters[key] ? "pill-on" : "pill-off"}`}>
                      {filters[key] ? "ON" : "OFF"}
                    </div>
                  </div>
                  <div className="toggle-label">{meta.label}</div>
                  <div className="toggle-desc">{meta.desc}</div>
                  {filters[key] && meta.covers && (
                    <div className="toggle-covers">
                      {meta.covers.slice(0, 3).map((c, i) => (
                        <span key={i} className="toggle-cover-tag">{c}</span>
                      ))}
                      {meta.covers.length > 3 && (
                        <span className="toggle-cover-tag">+{meta.covers.length - 3} more</span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}