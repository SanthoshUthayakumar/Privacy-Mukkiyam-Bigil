from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import os, uuid, json, shutil

from utils.ocr        import extract_sensitive_boxes
from utils.detector   import detect_faces
from utils.yolo_model import detect_sensitive_regions
from utils.metadata   import extract_metadata
from utils.aes_redact import (
    encrypt_redact,
    decrypt_restore,
    get_attempt_status,
    MAX_ATTEMPTS,
)

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

UPLOAD_FOLDER  = "uploads"
OUTPUT_FOLDER  = "outputs"
META_FOLDER    = "meta"

for d in [UPLOAD_FOLDER, OUTPUT_FOLDER, META_FOLDER]:
    os.makedirs(d, exist_ok=True)

@app.route("/process", methods=["POST"])
def process():
    if "image" not in request.files:
        return jsonify({"error": "No image provided"}), 400

    file         = request.files["image"]
    filters      = json.loads(request.form.get("filters",      "{}"))
    manual_boxes = json.loads(request.form.get("manual_boxes", "[]"))
    secret_key   = request.form.get("secret_key", "").strip()

    if not secret_key:
        return jsonify({"error": "secret_key is required for AES redaction"}), 400
    if len(secret_key) < 6:
        return jsonify({"error": "secret_key must be at least 6 characters"}), 400

    uid = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1].lower() or ".png"
    orig = os.path.join(UPLOAD_FOLDER, f"{uid}{ext}")
    file.save(orig)

    # ── Detect sensitive regions ──────────────────────────────────────────────
    all_boxes = []
    errors    = []

    try:
        all_boxes.extend(extract_sensitive_boxes(orig, filters))
    except Exception as e:
        errors.append(f"OCR: {e}")
        print(f"[OCR Error] {e}")

    if filters.get("face", True):
        try:
            all_boxes.extend(detect_faces(orig))
        except Exception as e:
            errors.append(f"Face: {e}")

    if filters.get("object", False):
        try:
            all_boxes.extend(detect_sensitive_regions(orig))
        except Exception as e:
            errors.append(f"YOLO: {e}")

    for mb in manual_boxes:
        all_boxes.append({
            "x": int(mb.get("x", 0)), "y": int(mb.get("y", 0)),
            "w": int(mb.get("w", 10)), "h": int(mb.get("h", 10)),
            "label": "manual", "display_label": "Manual", "value": "MANUAL",
        })

    # ── Extract metadata from original (before stripping) ────────────────────
    try:
        metadata_report = extract_metadata(orig)
        metadata_report["stripped"] = True   # will be stripped inside encrypt_redact
    except Exception as e:
        metadata_report = {"stripped": True, "total": 0, "fields": [],
                           "by_category": {}, "has_gps": False}

    # ── AES encrypt redact ────────────────────────────────────────────────────
    redacted_path = os.path.join(OUTPUT_FOLDER, f"{uid}_redacted{ext}")
    meta_path     = os.path.join(META_FOLDER,   f"{uid}_meta.json")

    try:
        aes_result = encrypt_redact(
            image_path=orig,
            boxes=all_boxes,
            secret_key=secret_key,
            output_image_path=redacted_path,
            output_meta_path=meta_path,
        )
    except Exception as e:
        errors.append(f"AES: {e}")
        print(f"[AES Error] {e}")
        return jsonify({"error": f"Encryption failed: {e}", "errors": errors}), 500

    return jsonify({
        "id":               uid,
        "ext":              ext,
        "boxes":            all_boxes,
        "total_redactions": len(all_boxes),
        "total_encrypted":  aes_result["total_encrypted"],
        "key_hash":         aes_result["key_hash"][:16] + "…",   # partial, for UI display
        "output_url":       f"/download/{uid}",
        "original_url":     f"/download_original/{uid}",
        "meta_url":         f"/download_meta/{uid}",
        "metadata":         metadata_report,
        "errors":           errors,
    })

@app.route("/decrypt", methods=["POST"])
def decrypt():
    data        = request.get_json() or {}
    uid         = data.get("uid", "")
    ext         = data.get("ext", ".png")
    entered_key = data.get("secret_key", "").strip()

    if not uid or not entered_key:
        return jsonify({"ok": False, "reason": "uid and secret_key required"}), 400

    # Find files
    redacted_path  = None
    for e in [ext, ".png", ".jpg", ".jpeg"]:
        rp = os.path.join(OUTPUT_FOLDER, f"{uid}_redacted{e}")
        if os.path.exists(rp):
            redacted_path = rp
            ext = e
            break

    meta_path = os.path.join(META_FOLDER, f"{uid}_meta.json")

    if not redacted_path or not os.path.exists(meta_path):
        return jsonify({"ok": False, "reason": "files_not_found"}), 404

    # Check attempt status first
    status = get_attempt_status(meta_path)
    if status["locked"]:
        return jsonify({
            "ok":           False,
            "reason":       "locked_out",
            "wait_seconds": status["wait_seconds"],
            "attempts_left": 0,
        }), 429

    restored_path = os.path.join(OUTPUT_FOLDER, f"{uid}_restored{ext}")

    result = decrypt_restore(
        redacted_image_path=redacted_path,
        meta_path=meta_path,
        entered_key=entered_key,
        output_restored_path=restored_path,
    )

    if not result["ok"]:
        return jsonify(result), 403

    return jsonify({
        **result,
        "restored_url": f"/download_restored/{uid}",
    })

@app.route("/decrypt_status/<uid>")
def decrypt_status(uid):
    meta_path = os.path.join(META_FOLDER, f"{uid}_meta.json")
    if not os.path.exists(meta_path):
        return jsonify({"error": "not_found"}), 404
    return jsonify(get_attempt_status(meta_path))

RECEIVER_FOLDER = "receiver_sessions"
os.makedirs(RECEIVER_FOLDER, exist_ok=True)

@app.route("/decrypt_upload", methods=["POST"])
def decrypt_upload():
    # Validate inputs
    if "redacted_image" not in request.files:
        return jsonify({"ok": False, "reason": "redacted_image file required"}), 400
    if "meta_json" not in request.files:
        return jsonify({"ok": False, "reason": "meta_json file required"}), 400

    entered_key = request.form.get("secret_key", "").strip()
    if not entered_key:
        return jsonify({"ok": False, "reason": "secret_key required"}), 400

    img_file  = request.files["redacted_image"]
    meta_file = request.files["meta_json"]

    # Save uploaded files to a temp session folder
    session_id   = str(uuid.uuid4())
    ext          = os.path.splitext(img_file.filename)[1].lower() or ".png"
    img_path     = os.path.join(RECEIVER_FOLDER, f"{session_id}_redacted{ext}")
    meta_path    = os.path.join(RECEIVER_FOLDER, f"{session_id}_meta.json")
    restored_path = os.path.join(RECEIVER_FOLDER, f"{session_id}_restored{ext}")

    img_file.save(img_path)
    meta_file.save(meta_path)

    # Validate meta.json is valid JSON with required fields
    try:
        with open(meta_path) as f:
            meta = json.load(f)
        if "key_hash" not in meta or "encrypted_regions" not in meta:
            return jsonify({"ok": False, "reason": "invalid_meta_file"}), 400
    except Exception as e:
        return jsonify({"ok": False, "reason": f"meta_parse_error: {e}"}), 400

    # Check lockout status
    status = get_attempt_status(meta_path)
    if status["locked"]:
        return jsonify({
            "ok":            False,
            "reason":        "locked_out",
            "wait_seconds":  status["wait_seconds"],
            "attempts_left": 0,
        }), 429

    # Attempt decryption
    result = decrypt_restore(
        redacted_image_path=img_path,
        meta_path=meta_path,
        entered_key=entered_key,
        output_restored_path=restored_path,
    )

    if not result["ok"]:
        # On wrong key, cleanup uploaded files but keep meta for attempt tracking
        if result["reason"] == "wrong_key":
            try: os.remove(img_path)
            except: pass
        return jsonify(result), 403

    # Success — return restored image as base64 directly in response
    # (no uid-based download needed for receiver flow)
    import base64
    with open(restored_path, "rb") as f:
        img_bytes = f.read()
    img_b64 = base64.b64encode(img_bytes).decode()
    mime     = "image/jpeg" if ext in (".jpg", ".jpeg") else "image/png"

    # Cleanup session files after successful decrypt
    for p in [img_path, meta_path, restored_path]:
        try: os.remove(p)
        except: pass

    return jsonify({
        "ok":            True,
        "image_b64":     img_b64,
        "mime":          mime,
        "total_regions": result["total_regions"],
        "session_id":    session_id,
    })

@app.route("/download/<uid>")
def download(uid):
    for ext in [".png", ".jpg", ".jpeg", ".webp"]:
        path = os.path.join(OUTPUT_FOLDER, f"{uid}_redacted{ext}")
        if os.path.exists(path):
            return send_file(path, mimetype="image/png",
                             as_attachment=True,
                             download_name=f"redacted_{uid[:8]}.png")
    return jsonify({"error": "Not found"}), 404


@app.route("/download_original/<uid>")
def download_original(uid):
    for ext in [".png", ".jpg", ".jpeg", ".webp"]:
        path = os.path.join(UPLOAD_FOLDER, f"{uid}{ext}")
        if os.path.exists(path):
            return send_file(path)
    return jsonify({"error": "Not found"}), 404


@app.route("/download_meta/<uid>")
def download_meta(uid):
    path = os.path.join(META_FOLDER, f"{uid}_meta.json")
    if os.path.exists(path):
        return send_file(path, mimetype="application/json",
                         as_attachment=True,
                         download_name=f"redact_meta_{uid[:8]}.json")
    return jsonify({"error": "Not found"}), 404


@app.route("/download_restored/<uid>")
def download_restored(uid):
    for ext in [".png", ".jpg", ".jpeg", ".webp"]:
        path = os.path.join(OUTPUT_FOLDER, f"{uid}_restored{ext}")
        if os.path.exists(path):
            return send_file(path, mimetype="image/png",
                             as_attachment=True,
                             download_name=f"restored_{uid[:8]}.png")
    return jsonify({"error": "Not found"}), 404


@app.route("/health")
def health():
    return jsonify({"status": "ok", "version": "3.0", "mode": "AES-256-GCM redaction"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)