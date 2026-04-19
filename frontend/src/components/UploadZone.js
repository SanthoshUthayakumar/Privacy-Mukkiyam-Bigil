import { useRef, useState, useCallback } from "react";

export default function UploadZone({ onSelect }) {
  const fileInputRef = useRef();
  const videoRef = useRef();
  const canvasRef = useRef();
  const streamRef = useRef(null);

  const [dragging, setDragging] = useState(false);
  const [mode, setMode] = useState("options"); // options | camera | preview
  const [cameraError, setCameraError] = useState(null);
  const [capturedURL, setCapturedURL] = useState(null);
  const [facingMode, setFacingMode] = useState("user");

  // ── File / Drop handlers ─────────────────────────────────────────────────
  const handleFile = (file) => {
    if (file && file.type.startsWith("image/")) onSelect(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  // ── Camera ───────────────────────────────────────────────────────────────
  const startCamera = async (facing = facingMode) => {
    setCameraError(null);
    setCapturedURL(null);
    setMode("camera");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err) {
      setCameraError("Camera access denied or not available.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const flipCamera = () => {
    const next = facingMode === "user" ? "environment" : "user";
    setFacingMode(next);
    stopCamera();
    startCamera(next);
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const dataURL = canvas.toDataURL("image/png");
    setCapturedURL(dataURL);
    stopCamera();
    setMode("preview");
  };

  const confirmCapture = () => {
    if (!capturedURL) return;
    fetch(capturedURL)
      .then((r) => r.blob())
      .then((blob) => {
        const file = new File([blob], "captured.png", { type: "image/png" });
        onSelect(file);
      });
  };

  const retake = () => {
    setCapturedURL(null);
    startCamera();
  };

  const cancelCamera = () => {
    stopCamera();
    setCapturedURL(null);
    setMode("options");
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="upload-root">

      {/* ── OPTIONS MODE ── */}
      {mode === "options" && (
        <div className="upload-options">
          {/* Drag & Drop / File Upload */}
          <div
            className={`upload-card drag-card ${dragging ? "dragging" : ""}`}
            onClick={() => fileInputRef.current.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div className="upload-card-icon">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="1" y="1" width="38" height="38" rx="6"
                  stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
                <path d="M20 26V14M20 14L15 19M20 14L25 19"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 28h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
              </svg>
            </div>
            <p className="upload-card-title">Upload / Drop</p>
            <p className="upload-card-sub">Click or drag an image here</p>
            <div className="upload-card-formats">
              <span>PNG</span><span>JPG</span><span>WEBP</span>
            </div>
          </div>

          {/* Camera Capture */}
          <div className="upload-card camera-card" onClick={() => startCamera()}>
            <div className="upload-card-icon camera-icon">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="2" y="10" width="36" height="26" rx="4"
                  stroke="currentColor" strokeWidth="1.5" />
                <circle cx="20" cy="23" r="7"
                  stroke="currentColor" strokeWidth="1.5" />
                <circle cx="20" cy="23" r="3.5" fill="currentColor" opacity="0.3" />
                <path d="M14 10l2.5-4h7L26 10" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
                <circle cx="32" cy="16" r="1.5" fill="currentColor" opacity="0.5" />
              </svg>
            </div>
            <p className="upload-card-title">Capture Photo</p>
            <p className="upload-card-sub">Use your device camera</p>
            <div className="upload-card-formats">
              <span>Front</span><span>Rear</span><span>Live</span>
            </div>
          </div>
        </div>
      )}

      {/* ── CAMERA MODE ── */}
      {mode === "camera" && (
        <div className="camera-wrap">
          {cameraError ? (
            <div className="camera-error">
              <span className="camera-error-icon">⚠</span>
              <p>{cameraError}</p>
              <button className="btn-secondary" onClick={cancelCamera}>Go Back</button>
            </div>
          ) : (
            <>
              <div className="camera-viewfinder">
                <video ref={videoRef} className="camera-video" autoPlay playsInline muted />
                <div className="camera-corners">
                  <span className="corner tl" /><span className="corner tr" />
                  <span className="corner bl" /><span className="corner br" />
                </div>
                <div className="camera-scan-line" />
              </div>

              <div className="camera-controls">
                <button className="cam-btn cam-btn-secondary" onClick={cancelCamera} title="Cancel">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <span>Cancel</span>
                </button>

                <button className="cam-btn cam-btn-capture" onClick={capturePhoto} title="Capture">
                  <div className="shutter-outer"><div className="shutter-inner" /></div>
                </button>

                <button className="cam-btn cam-btn-secondary" onClick={flipCamera} title="Flip camera">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M3 10a7 7 0 0 1 13.4-2.8M17 10a7 7 0 0 1-13.4 2.8"
                      stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    <path d="M16 4l1 3.2-3.2 1M4 16l-1-3.2 3.2-1"
                      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <span>Flip</span>
                </button>
              </div>

              <p className="camera-hint">Position sensitive content within the frame, then capture</p>
            </>
          )}
        </div>
      )}

      {/* ── PREVIEW MODE (after capture) ── */}
      {mode === "preview" && capturedURL && (
        <div className="capture-preview">
          <p className="capture-preview-label">
            <span className="dot-green" /> Photo captured — looks good?
          </p>
          <img src={capturedURL} alt="Captured" className="capture-img" />
          <div className="capture-actions">
            <button className="btn-secondary" onClick={retake}>↩ Retake</button>
            <button className="btn-primary" onClick={confirmCapture}>
              ✓ Use this photo
            </button>
          </div>
        </div>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}