import cv2
import numpy as np
import os

def detect_faces(image_path):
    """
    Detect faces using OpenCV Haar Cascade.
    Returns list of box dicts. Never raises — returns [] on any error.
    """
    # ── Validate file exists and is readable ─────────────────────────────────
    if not image_path or not os.path.isfile(image_path):
        print(f"[Face] File not found: {image_path}")
        return []

    # ── Read image ────────────────────────────────────────────────────────────
    img = cv2.imread(str(image_path))

    if img is None:
        try:
            from PIL import Image
            pil_img = Image.open(image_path).convert("RGB")
            img = np.array(pil_img)
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
        except Exception as e:
            print(f"[Face] Could not read image via PIL either: {e}")
            return []

    if not isinstance(img, np.ndarray) or img.size == 0:
        print(f"[Face] Empty or invalid image array for: {image_path}")
        return []

    # ── Convert to grayscale ──────────────────────────────────────────────────
    try:
        if len(img.shape) == 2:
            # Already grayscale
            gray = img
        elif img.shape[2] == 4:
            # RGBA → gray
            gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
        else:
            # BGR → gray
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    except Exception as e:
        print(f"[Face] cvtColor error: {e}")
        return []

    # ── Load Haar Cascade ─────────────────────────────────────────────────────
    try:
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        face_cascade = cv2.CascadeClassifier(cascade_path)
        if face_cascade.empty():
            print(f"[Face] Failed to load cascade from: {cascade_path}")
            return []
    except Exception as e:
        print(f"[Face] Cascade load error: {e}")
        return []

    # ── Detect ────────────────────────────────────────────────────────────────
    try:
        faces = face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(30, 30),
            flags=cv2.CASCADE_SCALE_IMAGE
        )
    except Exception as e:
        print(f"[Face] detectMultiScale error: {e}")
        return []

    boxes = []
    if len(faces) == 0:
        return boxes

    for (x, y, w, h) in faces:
        boxes.append({
            "x":            int(x),
            "y":            int(y),
            "w":            int(w),
            "h":            int(h),
            "label":        "face",
            "display_label": "Face",
            "value":        "FACE",
        })

    return boxes