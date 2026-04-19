import { useState } from "react";

const RISK_COLOR = { high: "#e05c5c", medium: "#d4b83a", low: "#5a6578" };
const RISK_LABEL = { high: "HIGH RISK", medium: "MEDIUM", low: "LOW" };

export default function MetadataPanel({ metadata, stripEnabled, onToggleStrip }) {
  const [expanded, setExpanded] = useState({ file: true }); // file open by default

  if (!metadata) return null;

  const {
    stripped = false,
    fields_removed = 0,
    gps_removed = false,
    gps_string = null,
    size_before_kb,
    size_after_kb,
    saved_kb = 0,
    by_category = {},
    total = 0,
    has_gps = false,
    file_info = {},
  } = metadata;

  const toggleCat = (cat) =>
    setExpanded((p) => ({ ...p, [cat]: !p[cat] }));

  const highCount = Object.values(by_category)
    .filter((c) => c.risk === "high" && c.fields?.length > 0).length;

  return (
    <div className="meta-panel">

      {/* ── Header ── */}
      <div className="meta-title-row">
        <span className="meta-title">🔍 Metadata Report</span>
        {has_gps && <span className="meta-gps-badge">⚠ GPS FOUND</span>}
        {stripped && <span className="meta-ok-badge">✓ STRIPPED</span>}
      </div>
      <p className="meta-subtitle">
        Hidden data embedded in the image file — exposed even after visual redaction.
      </p>

      {/* ── Summary ── */}
      <div className="meta-summary">
        <div className="meta-stat">
          <span className="meta-stat-num">{total}</span>
          <span className="meta-stat-label">Fields Found</span>
        </div>
        <div className={`meta-stat ${has_gps ? "meta-stat-danger" : ""}`}>
          <span className="meta-stat-num">{has_gps ? "YES" : "NO"}</span>
          <span className="meta-stat-label">GPS Data</span>
        </div>
        <div className="meta-stat">
          <span className="meta-stat-num" style={{ color: highCount > 0 ? "#e05c5c" : "var(--green)" }}>
            {highCount}
          </span>
          <span className="meta-stat-label">High Risk</span>
        </div>
        {size_before_kb && (
          <div className="meta-stat">
            <span className="meta-stat-num">{size_before_kb} KB</span>
            <span className="meta-stat-label">Before Strip</span>
          </div>
        )}
        {size_after_kb && (
          <div className="meta-stat">
            <span className="meta-stat-num" style={{ color: "var(--green)" }}>{size_after_kb} KB</span>
            <span className="meta-stat-label">After Strip</span>
          </div>
        )}
      </div>

      {/* ── GPS warning ── */}
      {has_gps && gps_string && (
        <div className="meta-gps-warning">
          <span className="meta-gps-icon">📍</span>
          <div>
            <p className="meta-gps-title">GPS Location Embedded</p>
            <p className="meta-gps-coords">{gps_string}</p>
            <p className="meta-gps-note">
              Anyone receiving this file can pinpoint where it was taken.
              {stripped ? " This has been removed from the clean output." : " Enable stripping to remove it."}
            </p>
          </div>
        </div>
      )}

      {/* ── Category accordion ── */}
      {Object.keys(by_category).length > 0 ? (
        <div className="meta-categories">
          {Object.entries(by_category).map(([catKey, catData]) => (
            <div key={catKey} className="meta-cat">
              <button className="meta-cat-header" onClick={() => toggleCat(catKey)}>
                <div className="meta-cat-left">
                  <span className="meta-cat-icon">{catData.icon}</span>
                  <span className="meta-cat-label">{catData.label}</span>
                  <span className="meta-cat-count">{catData.fields?.length || 0}</span>
                </div>
                <div className="meta-cat-right">
                  <span className="meta-risk-badge" style={{ color: RISK_COLOR[catData.risk] }}>
                    {RISK_LABEL[catData.risk]}
                  </span>
                  <span className="meta-chevron">{expanded[catKey] ? "▲" : "▼"}</span>
                </div>
              </button>
              {expanded[catKey] && (
                <div className="meta-fields">
                  {catData.fields?.map((f, i) => (
                    <div key={i} className="meta-field-row">
                      <span className="meta-field-tag">{f.tag}</span>
                      <span className="meta-field-value">{f.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="meta-empty">✓ No metadata categories found.</div>
      )}

      {/* ── Strip toggle (only shown before processing) ── */}
      {onToggleStrip && (
        <div className="meta-strip-row">
          <div className="meta-strip-info">
            <p className="meta-strip-title">Strip All Metadata from Output</p>
            <p className="meta-strip-desc">
              Permanently remove all {total} metadata fields.
              {saved_kb > 0 && ` Saves ~${saved_kb} KB.`}
            </p>
          </div>
          <button
            className={`meta-toggle ${stripEnabled ? "meta-toggle-on" : "meta-toggle-off"}`}
            onClick={onToggleStrip}
          >
            {stripEnabled ? "ON" : "OFF"}
          </button>
        </div>
      )}

      {/* ── Result banner ── */}
      {stripped && (
        <div className="meta-stripped-banner">
          <span className="meta-stripped-icon">✓</span>
          <div>
            <p className="meta-stripped-title">All Metadata Successfully Stripped</p>
            <p className="meta-stripped-detail">
              {fields_removed} fields removed
              {gps_removed && " · GPS coordinates erased"}
              {saved_kb > 0 && ` · Saved ${saved_kb} KB`}
              {size_after_kb && ` · Clean file: ${size_after_kb} KB`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}