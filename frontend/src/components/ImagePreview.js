import { useRef, useEffect, useState } from "react";

const LABEL_COLORS = {
  face: "#e05c5c",
  email: "#e07d2a",
  phone: "#d4b83a",
  password: "#5ab06e",
  card: "#5a9ecc",
  object: "#9b72e8",
  manual: "#ffffff",
};

export default function ImagePreview({ imageURL, boxes }) {
  const imgRef = useRef();
  const [scale, setScale] = useState({ x: 1, y: 1, w: 0, h: 0 });

  const updateScale = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    setScale({
      x: img.clientWidth / img.naturalWidth,
      y: img.clientHeight / img.naturalHeight,
      w: img.clientWidth,
      h: img.clientHeight,
    });
  };

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    img.onload = updateScale;
    if (img.complete) updateScale();
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [imageURL]);

  return (
    <div className="preview-wrap">
      <div className="preview-container" style={{ position: "relative", display: "inline-block" }}>
        <img
          ref={imgRef}
          src={imageURL}
          alt="Preview"
          className="preview-img"
          onLoad={updateScale}
        />
        {/* Overlay boxes */}
        <svg
          className="preview-overlay"
          style={{
            position: "absolute",
            top: 0, left: 0,
            width: scale.w,
            height: scale.h,
            pointerEvents: "none",
          }}
        >
          {boxes.map((box, i) => {
            const color = LABEL_COLORS[box.label] || "#fff";
            return (
              <g key={i}>
                <rect
                  x={box.x * scale.x}
                  y={box.y * scale.y}
                  width={box.w * scale.x}
                  height={box.h * scale.y}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeDasharray="4 2"
                  opacity="0.9"
                />
                <rect
                  x={box.x * scale.x}
                  y={box.y * scale.y - 18}
                  width={Math.max((box.label.length + 2) * 7, 50)}
                  height={16}
                  fill={color}
                  rx="2"
                  opacity="0.85"
                />
                <text
                  x={box.x * scale.x + 4}
                  y={box.y * scale.y - 5}
                  fontSize="10"
                  fill="#000"
                  fontWeight="700"
                  fontFamily="monospace"
                >
                  {box.label.toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {boxes.length > 0 && (
        <div className="preview-legend">
          {[...new Set(boxes.map((b) => b.label))].map((label) => (
            <span key={label} className="legend-item">
              <span
                className="legend-dot"
                style={{ background: LABEL_COLORS[label] || "#fff" }}
              />
              {label} ({boxes.filter((b) => b.label === label).length})
            </span>
          ))}
        </div>
      )}
      {boxes.length === 0 && (
        <p className="preview-hint">Process the image to see detected sensitive regions.</p>
      )}
    </div>
  );
}