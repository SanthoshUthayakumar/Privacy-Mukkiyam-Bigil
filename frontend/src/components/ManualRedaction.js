import { useRef, useState, useEffect } from "react";

export default function ManualRedaction({ imageURL, manualBoxes, onChange }) {
  const containerRef = useRef();
  const imgRef = useRef();
  const [drawing, setDrawing] = useState(false);
  const [current, setCurrent] = useState(null);
  const [scale, setScale] = useState({ x: 1, y: 1, w: 0, h: 0 });

  const updateScale = () => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return;
    setScale({
      x: img.naturalWidth / img.clientWidth,
      y: img.naturalHeight / img.clientHeight,
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

  const getPos = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onMouseDown = (e) => {
    e.preventDefault();
    const pos = getPos(e);
    setDrawing(true);
    setCurrent({ startX: pos.x, startY: pos.y, x: pos.x, y: pos.y, w: 0, h: 0 });
  };

  const onMouseMove = (e) => {
    if (!drawing || !current) return;
    const pos = getPos(e);
    const x = Math.min(pos.x, current.startX);
    const y = Math.min(pos.y, current.startY);
    const w = Math.abs(pos.x - current.startX);
    const h = Math.abs(pos.y - current.startY);
    setCurrent((c) => ({ ...c, x, y, w, h }));
  };

  const onMouseUp = () => {
    if (!drawing || !current) return;
    setDrawing(false);
    if (current.w > 5 && current.h > 5) {
      // Convert display coords → original image coords
      const box = {
        x: Math.round(current.x * scale.x),
        y: Math.round(current.y * scale.y),
        w: Math.round(current.w * scale.x),
        h: Math.round(current.h * scale.y),
      };
      onChange([...manualBoxes, box]);
    }
    setCurrent(null);
  };

  const removeBox = (i) => {
    onChange(manualBoxes.filter((_, idx) => idx !== i));
  };

  // Convert original coords → display coords
  const toDisplay = (box) => ({
    x: box.x / scale.x,
    y: box.y / scale.y,
    w: box.w / scale.x,
    h: box.h / scale.y,
  });

  return (
    <div className="manual-wrap">
      <div
        ref={containerRef}
        className="manual-canvas"
        style={{ position: "relative", display: "inline-block", cursor: "crosshair" }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onTouchStart={onMouseDown}
        onTouchMove={onMouseMove}
        onTouchEnd={onMouseUp}
      >
        <img
          ref={imgRef}
          src={imageURL}
          alt="Draw redaction"
          className="preview-img"
          draggable={false}
          onLoad={updateScale}
        />

        {/* SVG overlays */}
        <svg
          style={{
            position: "absolute", top: 0, left: 0,
            width: scale.w, height: scale.h,
            pointerEvents: "none",
          }}
        >
          {/* Saved manual boxes */}
          {manualBoxes.map((box, i) => {
            const d = toDisplay(box);
            return (
              <g key={i}>
                <rect
                  x={d.x} y={d.y} width={d.w} height={d.h}
                  fill="rgba(255,50,50,0.25)"
                  stroke="#ff3232"
                  strokeWidth="2"
                />
                <text x={d.x + 3} y={d.y + 14} fontSize="11" fill="#ff3232" fontWeight="700" fontFamily="monospace">
                  MANUAL
                </text>
              </g>
            );
          })}

          {/* In-progress box */}
          {current && current.w > 0 && (
            <rect
              x={current.x} y={current.y}
              width={current.w} height={current.h}
              fill="rgba(255,255,255,0.15)"
              stroke="#ffffff"
              strokeWidth="1.5"
              strokeDasharray="5 3"
            />
          )}
        </svg>
      </div>

      {/* Box list */}
      {manualBoxes.length > 0 && (
        <div className="manual-list">
          <p className="manual-list-title">Manual Boxes ({manualBoxes.length})</p>
          {manualBoxes.map((box, i) => (
            <div key={i} className="manual-list-item">
              <span className="manual-list-coords">
                x:{box.x} y:{box.y} {box.w}×{box.h}
              </span>
              <button className="manual-remove" onClick={() => removeBox(i)}>✕</button>
            </div>
          ))}
        </div>
      )}

      {manualBoxes.length === 0 && (
        <p className="manual-hint">No manual boxes drawn yet. Drag on the image to add.</p>
      )}
    </div>
  );
}