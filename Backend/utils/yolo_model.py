import os
from ultralytics import YOLO

# ── Model paths (priority order) ─────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.dirname(__file__))   # Backend/
CUSTOM_MODEL = os.path.join(BASE_DIR, "runs", "train", "idcard_redact_v1", "weights", "best.pt")
FALLBACK     = os.path.join(BASE_DIR, "yolov8n.pt")

# Classes from custom model that must always be redacted
SENSITIVE_CLASSES = {
    "aadhaar_number", "aadhaar_name", "aadhaar_dob", "aadhaar_address",
    "aadhaar_photo",  "aadhaar_qr",
    "pan_number",     "pan_name",     "pan_dob",     "pan_photo",
    "passport_number","passport_mrz",
    "dl_number",      "voter_id_number",
    "payment_upi_id", "payment_amount","payment_account",
    "payment_ifsc",   "payment_name",
    "card_number",    "card_cvv",     "card_expiry",  "card_holder_name",
    "signature",
}

# Fallback pretrained class names that are sensitive
SENSITIVE_FALLBACK = {"person"}

_model_cache = None

def _load_model():
    global _model_cache
    if _model_cache is not None:
        return _model_cache, os.path.exists(CUSTOM_MODEL)

    if os.path.exists(CUSTOM_MODEL):
        print(f"[YOLO] Loading custom model: {CUSTOM_MODEL}")
        _model_cache = YOLO(CUSTOM_MODEL)
        return _model_cache, True
    else:
        print(f"[YOLO] Custom model not found, using fallback: {FALLBACK}")
        _model_cache = YOLO(FALLBACK)
        return _model_cache, False


def detect_sensitive_regions(image_path, conf_threshold=0.35):
    """
    Run YOLO inference on image.
    Returns list of box dicts with x, y, w, h, label, value, confidence.
    """
    model, is_custom = _load_model()

    try:
        results = model(image_path, verbose=False, conf=conf_threshold)
    except Exception as e:
        print(f"[YOLO] Inference error: {e}")
        return []

    boxes = []
    for r in results:
        for box in r.boxes:
            cls_id   = int(box.cls[0])
            cls_name = r.names[cls_id]
            conf     = float(box.conf[0])

            # Filter: only keep sensitive classes
            sensitive_set = SENSITIVE_CLASSES if is_custom else SENSITIVE_FALLBACK
            if cls_name not in sensitive_set:
                continue

            x1, y1, x2, y2 = box.xyxy[0].tolist()
            boxes.append({
                "x":     int(x1),
                "y":     int(y1),
                "w":     int(x2 - x1),
                "h":     int(y2 - y1),
                "label": "object",
                "value": cls_name,
                "conf":  round(conf, 3),
            })

    return boxes


def get_model_info():
    """Return info about which model is loaded."""
    _, is_custom = _load_model()
    return {
        "custom_model_loaded": is_custom,
        "custom_model_path":   CUSTOM_MODEL if is_custom else None,
        "fallback_path":       FALLBACK,
        "sensitive_classes":   list(SENSITIVE_CLASSES),
    }