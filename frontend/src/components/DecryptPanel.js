import { useState, useEffect, useRef } from "react";

const BACKEND     = "http://localhost:5000";
const MAX_TRIES   = 3;
const LOCKOUT_SEC = 30;

export default function DecryptPanel({ result, backend }) {
  const [key,          setKey]          = useState("");
  const [show,         setShow]         = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [status,       setStatus]       = useState(null);   // null|success|wrong|locked
  const [attemptsLeft, setAttemptsLeft] = useState(MAX_TRIES);
  const [countdown,    setCountdown]    = useState(0);
  const [restoredUrl,  setRestoredUrl]  = useState(null);
  const timerRef = useRef(null);

  // Poll lockout status on mount
  useEffect(() => {
    if (!result?.id) return;
    fetch(`${BACKEND}/decrypt_status/${result.id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.locked) {
          setStatus("locked");
          startCountdown(d.wait_seconds);
        } else {
          setAttemptsLeft(d.attempts_left ?? MAX_TRIES);
        }
      })
      .catch(() => {});
    return () => clearInterval(timerRef.current);
  }, [result?.id]);

  const startCountdown = (secs) => {
    setCountdown(secs);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timerRef.current);
          setStatus(null);
          setAttemptsLeft(MAX_TRIES);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const handleDecrypt = async () => {
    if (!key.trim() || status === "locked") return;
    setLoading(true);
    setStatus(null);

    try {
      const res  = await fetch(`${BACKEND}/decrypt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid:        result.id,
          ext:        result.ext,
          secret_key: key,
        }),
      });
      const data = await res.json();

      if (data.ok) {
        setStatus("success");
        setRestoredUrl(`${BACKEND}${data.restored_url}`);
        setAttemptsLeft(MAX_TRIES);
      } else if (data.reason === "locked_out") {
        setStatus("locked");
        startCountdown(data.wait_seconds || LOCKOUT_SEC);
        setAttemptsLeft(0);
      } else if (data.reason === "wrong_key") {
        setStatus("wrong");
        setAttemptsLeft(data.attempts_left ?? attemptsLeft - 1);
      } else {
        setStatus("error");
      }
    } catch (e) {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  };

  const downloadRestored = () => {
    const a = document.createElement("a");
    a.href = restoredUrl;
    a.download = `restored_${result.id.slice(0, 8)}.png`;
    a.click();
  };

  const resetDecrypt = () => {
    setKey("");
    setStatus(null);
    setRestoredUrl(null);
    setAttemptsLeft(MAX_TRIES);
  };

  return (
    <div className="decrypt-panel">
      <div className="decrypt-header">
        <span className="decrypt-icon">🔓</span>
        <div>
          <p className="decrypt-title">Decrypt & Restore</p>
          <p className="decrypt-sub">
            Enter the correct key to restore all encrypted regions to their original state.
          </p>
        </div>
      </div>

      {/* Attempt indicator */}
      <div className="decrypt-attempts">
        {[...Array(MAX_TRIES)].map((_, i) => (
          <div
            key={i}
            className="attempt-dot"
            style={{
              background: i < attemptsLeft
                ? (status === "locked" ? "#f9a825" : "#00c9a7")
                : "rgba(255,107,107,0.3)",
              border: `2px solid ${i < attemptsLeft
                ? (status === "locked" ? "#f9a82580" : "#00c9a780")
                : "rgba(255,107,107,0.2)"}`,
            }}
          />
        ))}
        <span className="attempt-label">
          {status === "locked"
            ? `Locked — ${countdown}s`
            : `${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining`}
        </span>
      </div>

      {/* Success state */}
      {status === "success" && restoredUrl ? (
        <div className="decrypt-success">
          <div className="decrypt-success-banner">
            <span>✓</span>
            <div>
              <p className="decrypt-success-title">Decryption successful!</p>
              <p className="decrypt-success-sub">All encrypted regions have been restored.</p>
            </div>
          </div>
          <img src={restoredUrl} alt="Restored" className="decrypt-restored-img" />
          <div className="decrypt-success-actions">
            <button className="btn-primary" onClick={downloadRestored}>
              ⬇ Download Restored Image
            </button>
            <button className="btn-secondary" onClick={resetDecrypt}>
              🔒 Re-lock
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Key input */}
          <div className="decrypt-input-wrap">
            <input
              className="decrypt-input"
              type={show ? "text" : "password"}
              placeholder="Enter decryption key..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleDecrypt()}
              disabled={status === "locked" || loading}
              autoComplete="current-password"
            />
            <button
              className="key-show-btn"
              onClick={() => setShow(!show)}
              tabIndex={-1}
              disabled={status === "locked"}
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>

          {/* Status messages */}
          {status === "wrong" && (
            <div className="decrypt-msg decrypt-msg-wrong">
              ✕ Incorrect key.{" "}
              {attemptsLeft > 0
                ? `${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`
                : "No attempts left."}
            </div>
          )}
          {status === "locked" && (
            <div className="decrypt-msg decrypt-msg-locked">
              🔒 Too many wrong attempts. Locked for{" "}
              <strong>{countdown}s</strong>.
            </div>
          )}
          {status === "error" && (
            <div className="decrypt-msg decrypt-msg-wrong">
              ⚠ Server error. Please try again.
            </div>
          )}

          {/* Lockout visual timer */}
          {status === "locked" && countdown > 0 && (
            <div className="decrypt-lockout-bar">
              <div
                className="decrypt-lockout-fill"
                style={{ width: `${(countdown / LOCKOUT_SEC) * 100}%` }}
              />
            </div>
          )}

          <button
            className="btn-primary decrypt-btn"
            onClick={handleDecrypt}
            disabled={loading || status === "locked" || !key.trim()}
          >
            {loading ? (
              <><span className="spinner" /> Decrypting...</>
            ) : status === "locked" ? (
              `🔒 Locked (${countdown}s)`
            ) : (
              "🔓 Decrypt & Restore"
            )}
          </button>
        </>
      )}
    </div>
  );
}