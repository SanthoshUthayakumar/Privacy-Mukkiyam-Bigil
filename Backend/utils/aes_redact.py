import os
import json
import base64
import hashlib
import time
import numpy as np
from datetime import datetime, timezone

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes as crypto_hashes
from cryptography.hazmat.backends import default_backend

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

import cv2

def hash_key(secret_key: str) -> str:
    """SHA-256 hash of the secret key — stored, never the raw key."""
    return hashlib.sha256(secret_key.encode("utf-8")).hexdigest()


def derive_aes_key(secret_key: str, salt: bytes) -> bytes:
    """Derive a 256-bit AES key from the secret key using PBKDF2-HMAC-SHA256."""
    kdf = PBKDF2HMAC(
        algorithm=crypto_hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=300_000,
        backend=default_backend(),
    )
    return kdf.derive(secret_key.encode("utf-8"))


def verify_key(entered_key: str, stored_hash: str) -> bool:
    """Compare SHA-256 of entered key with stored hash."""
    return hash_key(entered_key) == stored_hash


def _load_image(image_path: str) -> np.ndarray:
    img = cv2.imread(str(image_path))
    if img is not None:
        return img
    if HAS_PIL:
        pil = Image.open(image_path).convert("RGB")
        arr = np.array(pil)
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    raise ValueError(f"Cannot load image: {image_path}")


def _strip_metadata(input_path: str, output_path: str):
    """
    Re-save image without any EXIF/IPTC/GPS metadata.
    Rebuilds from raw pixel data so no hidden data survives.
    """
    img = _load_image(input_path)
    # Rebuild from pixels only — drops all metadata layers
    if HAS_PIL:
        pil_src = Image.open(input_path)
        mode    = pil_src.mode if pil_src.mode in ("RGB", "RGBA", "L") else "RGB"
        clean   = Image.new(mode, pil_src.size)
        clean.putdata(list(pil_src.convert(mode).getdata()))
        ext = os.path.splitext(output_path)[1].lower()
        if ext in (".jpg", ".jpeg"):
            clean.convert("RGB").save(output_path, "JPEG", quality=95)
        else:
            clean.save(output_path)
    else:
        cv2.imwrite(output_path, img)

def _encrypt_region(pixels: np.ndarray, aes_key: bytes) -> dict:
    """
    Encrypt a numpy region (H×W×C) with AES-256-GCM.
    Returns dict with: ciphertext_b64, nonce_b64, shape
    (GCM tag is appended inside ciphertext by the library)
    """
    shape     = pixels.shape                        # (H, W, C) or (H, W)
    raw_bytes = pixels.tobytes()
    nonce     = os.urandom(12)                      # 96-bit GCM nonce

    aesgcm    = AESGCM(aes_key)
    ct        = aesgcm.encrypt(nonce, raw_bytes, None)   # ct includes 16-byte tag

    return {
        "ciphertext_b64": base64.b64encode(ct).decode(),
        "nonce_b64":      base64.b64encode(nonce).decode(),
        "shape":          list(shape),
        "dtype":          str(pixels.dtype),
    }


def _decrypt_region(enc: dict, aes_key: bytes) -> np.ndarray:
    """
    Decrypt a single encrypted region back to a numpy array.
    Raises cryptography.exceptions.InvalidTag if key is wrong.
    """
    ct    = base64.b64decode(enc["ciphertext_b64"])
    nonce = base64.b64decode(enc["nonce_b64"])

    aesgcm    = AESGCM(aes_key)
    raw_bytes = aesgcm.decrypt(nonce, ct, None)

    shape  = tuple(enc["shape"])
    dtype  = np.dtype(enc.get("dtype", "uint8"))
    return np.frombuffer(raw_bytes, dtype=dtype).reshape(shape)


def encrypt_redact(
    image_path: str,
    boxes: list,
    secret_key: str,
    output_image_path: str,
    output_meta_path: str,
) -> dict:
    """
    Full pipeline:
      1. Strip metadata
      2. For each box: extract pixels, encrypt, black-fill
      3. Save redacted image
      4. Save metadata JSON with encrypted regions + key hash

    Args:
        image_path:        path to original image
        boxes:             list of {x, y, w, h, label, ...}
        secret_key:        user-supplied secret key (never stored raw)
        output_image_path: where to save the black-box redacted image
        output_meta_path:  where to save the .json metadata file

    Returns:
        {total_encrypted, key_hash, output_image_path, output_meta_path}
    """
    # ── Step 1: Strip metadata ────────────────────────────────────────────────
    stripped_path = output_image_path + "_tmp_stripped" + os.path.splitext(image_path)[1]
    _strip_metadata(image_path, stripped_path)

    # ── Step 2: Load clean image ───────────────────────────────────────────────
    img = _load_image(stripped_path)
    os.remove(stripped_path)

    h_img, w_img = img.shape[:2]

    # ── Step 3: Derive AES key ────────────────────────────────────────────────
    salt    = os.urandom(16)
    aes_key = derive_aes_key(secret_key, salt)

    # ── Step 4: Encrypt regions + black-fill ──────────────────────────────────
    encrypted_regions = []
    output_img        = img.copy()

    for box in boxes:
        x  = max(0, int(box["x"]))
        y  = max(0, int(box["y"]))
        x2 = min(w_img, x + int(box["w"]))
        y2 = min(h_img, y + int(box["h"]))

        if x2 <= x or y2 <= y:
            continue

        # Extract pixels
        region = img[y:y2, x:x2].copy()

        # Encrypt
        enc = _encrypt_region(region, aes_key)
        enc["bbox"]          = {"x": x, "y": y, "w": x2 - x, "h": y2 - y}
        enc["label"]         = box.get("label", "unknown")
        enc["display_label"] = box.get("display_label", box.get("label", "unknown"))
        enc["value"]         = box.get("value", "")
        encrypted_regions.append(enc)

        # Black-fill in output image
        output_img[y:y2, x:x2] = 0

    # ── Step 5: Save redacted image ───────────────────────────────────────────
    cv2.imwrite(output_image_path, output_img)

    # ── Step 6: Save metadata JSON ────────────────────────────────────────────
    meta = {
        "version":           "1.0",
        "created_at":        datetime.now(timezone.utc).isoformat(),
        "key_hash":          hash_key(secret_key),
        "salt_b64":          base64.b64encode(salt).decode(),
        "image_shape":       list(img.shape),
        "total_encrypted":   len(encrypted_regions),
        "encrypted_regions": encrypted_regions,
    }
    with open(output_meta_path, "w") as f:
        json.dump(meta, f, indent=2)

    return {
        "total_encrypted":   len(encrypted_regions),
        "key_hash":          meta["key_hash"],
        "output_image_path": output_image_path,
        "output_meta_path":  output_meta_path,
    }


_attempt_store: dict = {}
MAX_ATTEMPTS   = 3
LOCKOUT_SECS   = 30


def decrypt_restore(
    redacted_image_path: str,
    meta_path: str,
    entered_key: str,
    output_restored_path: str,
) -> dict:
    """
    Restore original image by decrypting all encrypted regions.

    Returns:
        {ok, reason, restored_path, attempts_left}
    """
    
    if not os.path.exists(meta_path):
        return {"ok": False, "reason": "meta_not_found"}

    with open(meta_path) as f:
        meta = json.load(f)

    
    store = _attempt_store.setdefault(meta_path, {"attempts": 0, "locked_until": 0})

    now = time.time()
    if now < store["locked_until"]:
        wait = int(store["locked_until"] - now)
        return {"ok": False, "reason": "locked_out", "wait_seconds": wait}

   
    if not verify_key(entered_key, meta["key_hash"]):
        store["attempts"] += 1
        remaining = MAX_ATTEMPTS - store["attempts"]

        if store["attempts"] >= MAX_ATTEMPTS:
            store["locked_until"] = now + LOCKOUT_SECS
            store["attempts"]     = 0   # reset after lockout triggers
            return {
                "ok":            False,
                "reason":        "locked_out",
                "wait_seconds":  LOCKOUT_SECS,
                "attempts_left": 0,
            }

        return {
            "ok":            False,
            "reason":        "wrong_key",
            "attempts_left": remaining,
        }

    store["attempts"]     = 0
    store["locked_until"] = 0

    salt    = base64.b64decode(meta["salt_b64"])
    aes_key = derive_aes_key(entered_key, salt)

    restored = _load_image(redacted_image_path)

    failed_regions = 0
    for enc in meta.get("encrypted_regions", []):
        try:
            region = _decrypt_region(enc, aes_key)
            bbox   = enc["bbox"]
            x, y, w, h = bbox["x"], bbox["y"], bbox["w"], bbox["h"]
            restored[y:y+h, x:x+w] = region
        except Exception as e:
            print(f"[Decrypt] Region failed: {e}")
            failed_regions += 1

    cv2.imwrite(output_restored_path, restored)

    return {
        "ok":             True,
        "reason":         "success",
        "restored_path":  output_restored_path,
        "total_regions":  len(meta.get("encrypted_regions", [])),
        "failed_regions": failed_regions,
        "attempts_left":  MAX_ATTEMPTS,
    }


def get_attempt_status(meta_path: str) -> dict:
    """Check current attempt status for a given metadata file."""
    store = _attempt_store.get(meta_path, {"attempts": 0, "locked_until": 0})
    now   = time.time()
    if now < store["locked_until"]:
        wait = int(store["locked_until"] - now)
        return {"locked": True, "wait_seconds": wait, "attempts_left": 0}
    return {
        "locked":        False,
        "wait_seconds":  0,
        "attempts_left": MAX_ATTEMPTS - store["attempts"],
    }