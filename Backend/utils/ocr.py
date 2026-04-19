import cv2
import pytesseract
import re
import os
import numpy as np

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

if os.name == "nt":
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

def _luhn_check(number):
    digits = [int(d) for d in re.sub(r"\D", "", number)]
    if not (13 <= len(digits) <= 19):
        return False
    total = 0
    for i, d in enumerate(digits[::-1]):
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


PATTERN_DEFS = {

    # =========================================================================
    # AADHAAR
    # =========================================================================
    # Requires space/dash between groups → won't match 12-digit UPI txn IDs
    "aadhaar_number": (
        r"\b(\d{4}[\s\-]\d{4}[\s\-]\d{4})\b",
        1, False
    ),
    "aadhaar_labeled": (
        r"(?i)(?:aadhaar|aadhar|uid)\s*(?:no\.?|number|num|#)?"
        r"[\s:.\-]*(\d{4}[\s\-]?\d{4}[\s\-]?\d{4})\b",
        1, False
    ),
    "aadhaar_masked": (
        r"(?i)\b(?:x{4}[\s\-]?x{4}[\s\-]?)(\d{4})\b",
        1, False
    ),

    # =========================================================================
    # PAN
    # =========================================================================
    "pan_number": (
        r"\b([A-Z]{5}[0-9]{4}[A-Z])\b",
        1, False
    ),

    # =========================================================================
    # GOVERNMENT IDs
    # =========================================================================
    "voter_id": (
        r"\b([A-Z]{3}[0-9]{7})\b",
        1, False
    ),
    "dl_number": (
        r"\b([A-Z]{2}[\s\-]?\d{2}[\s\-]\d{4,11})\b",
        1, False
    ),
    "passport_number": (
        r"\b([A-Z][1-9]\d{6})\b",
        1, False
    ),
    "mrz_line": (
        r"\b([A-Z0-9<]{30,44})\b",
        1, False
    ),
    "roll_number": (
        r"(?i)"
        r"(?:roll\s*no\.?|roll\s*number|"
        r"reg(?:istration)?\s*no\.?|reg(?:istration)?\s*number|"
        r"enrollment\s*no\.?|enroll\s*no\.?|"
        r"admission\s*no\.?|"
        r"regd?\s*no\.?|"
        r"application\s*no\.?)"
        r"[\s:.\-]*([A-Z0-9][A-Z0-9\/\-]{2,19})",
        1, False
    ),

    "dob_labeled": (
        r"(?i)(?:d\.?o\.?b\.?|date\s*of\s*birth|born\s*on|birth\s*date)"
        r"[\s:.\-]*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})",
        1, False
    ),
    "dob_standalone": (
        r"\b(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})\b",
        1, False
    ),

    "student_id": (
        r"(?i)(?:student\s*(?:id|no\.?|number)|"
        r"id\s*(?:no\.?|number|card\s*no\.?)|"
        r"identity\s*(?:no\.?|number))"
        r"[\s:.\-]*([A-Z0-9\/\-]{3,20})",
        1, False
    ),
    "library_id": (
        r"(?i)library\s*(?:card\s*no\.?|id|number|no\.?)"
        r"[\s:.\-]*([A-Z0-9\-]{3,20})",
        1, False
    ),
    "employee_id": (
        r"(?i)(?:emp(?:loyee)?\s*(?:id|no\.?|code)|"
        r"staff\s*(?:id|no\.?)|faculty\s*(?:id|no\.?))"
        r"[\s:.\-]*([A-Z0-9\-]{3,15})",
        1, False
    ),

    # =========================================================================
    # CREDIT / DEBIT CARD
    # =========================================================================

    # Card number: spaced 4-4-4-4 or 16 consecutive digits — Luhn validated
    "card_number": (
        r"\b(\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{4}|"
        r"\d{4}[\s\-]\d{6}[\s\-]\d{5}|"
        r"\d{16})\b",
        1, True
    ),

    # Expiry: MM/YY or MM/YYYY — 2-digit year accepted (e.g. 12/20)
    "card_expiry": (
        r"\b((0[1-9]|1[0-2])\s*[/\-]\s*\d{2,4})\b",
        1, False
    ),

    # CVV: 3-4 digits after label only
    "card_cvv": (
        r"(?i)(?:cvv|cvc|cvv2|security\s*code)\s*[:\-]?\s*(\d{3,4})\b",
        1, False
    ),

    # Card holder WITH explicit label — safe, never matches ID card fields
    "card_holder_labeled": (
        r"(?i)(?:card\s*holder|name\s*on\s*card|cardholder)\s*[:\-]?\s*"
        r"([A-Z][A-Za-z](?:[A-Za-z\s\.]{1,28}[A-Za-z])?)",
        1, False
    ),

    
    "card_holder_on_card": (
        r"(?<!\w)([A-Z]{2,20} [A-Z]{1,20}(?:\s[A-Z]{1,20})?)(?!\w)",
        1, False
    ),

    "upi_id": (
        r"\b([a-zA-Z0-9.\-_]{2,64}@[a-zA-Z]{2,20})\b",
        1, False
    ),
    "upi_txn_id": (
        r"(?i)(?:upi\s*(?:transaction|txn|ref(?:erence)?)\s*(?:id|no\.?|number)?)"
        r"[\s:.\-]*([A-Z0-9]{8,25})\b",
        1, False
    ),
    "google_txn_id": (
        r"(?i)(?:google\s*(?:transaction|txn|pay)\s*(?:id|no\.?|ref)?|"
        r"gpay\s*(?:txn|ref|id)|"
        r"phonepe\s*(?:txn|ref|id)|"
        r"paytm\s*(?:txn|ref|id))"
        r"[\s:.\-]*([A-Za-z0-9]{8,30})\b",
        1, False
    ),
    "transaction_id": (
        r"(?i)(?:txn\s*(?:id|no\.?|ref)?|"
        r"transaction\s*(?:id|no\.?|ref(?:erence)?)?|"
        r"ref(?:erence)?\s*(?:no\.?|id|number)?|"
        r"utr\s*(?:no\.?|number)?|"
        r"order\s*(?:id|no\.?))"
        r"[\s:.\-#]*([A-Z0-9]{8,25})\b",
        1, False
    ),
    "ifsc_code": (
        r"\b([A-Z]{4}0[A-Z0-9]{6})\b",
        1, False
    ),
    "account_number": (
        r"(?i)(?:a[/\-]?c\.?\s*(?:no\.?|number)?|"
        r"acc(?:ount)?\s*(?:no\.?|number)?|"
        r"bank\s*(?:account)?\s*(?:no\.?|number)?)"
        r"[\s:.\-#]*(\d{9,18})\b",
        1, False
    ),
    "amount_inr": (
        r"((?:₹|Rs\.?|INR)\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?)",
        1, False
    ),
    "payment_name": (
        r"(?i)(?:from|sender|paid\s*by|sent\s*by)\s*[:\-]\s*"
        r"([A-Z][A-Z\s\.]{2,40})(?:\s*\(|$|\n)",
        1, False
    ),

    "email": (
        r"\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b",
        1, False
    ),
    "phone": (
        r"\b((?:\+?91[\s\-]?)?[6-9]\d{9})\b",
        1, False
    ),
    "phone_intl": (
        r"(\+\d{1,3}[\s\-]?\(?\d{1,4}\)?[\s\-]?\d{4,10})\b",
        1, False
    ),
    "pincode": (
        r"(?i)(?:pin\s*(?:code)?|postal\s*code|zip\s*(?:code)?)"
        r"[\s:.\-]*(\d{6})\b",
        1, False
    ),
    "password": (
        r"(?i)(?:password|passwd|pwd)\s*[:=]\s*(\S+)",
        1, False
    ),
    "otp": (
        r"(?i)(?:otp|one[\s\-]time[\s\-](?:password|code|pin))"
        r"[\s:.\-]*(\d{4,8})\b",
        1, False
    ),
}

LABEL_NAMES = {
    "aadhaar_number":      "Aadhaar",
    "aadhaar_labeled":     "Aadhaar",
    "aadhaar_masked":      "Aadhaar (partial)",
    "pan_number":          "PAN",
    "voter_id":            "Voter ID",
    "dl_number":           "DL No.",
    "passport_number":     "Passport",
    "mrz_line":            "MRZ",
    "roll_number":         "Roll No.",
    "dob_labeled":         "DOB",
    "dob_standalone":      "DOB",
    "student_id":          "Student ID",
    "library_id":          "Library ID",
    "employee_id":         "Employee ID",
    "card_number":         "Card No.",
    "card_expiry":         "Card Expiry",
    "card_cvv":            "CVV",
    "card_holder_labeled": "Card Holder",
    "card_holder_on_card": "Card Holder",
    "upi_id":              "UPI ID",
    "upi_txn_id":          "UPI Txn ID",
    "google_txn_id":       "Google Txn ID",
    "transaction_id":      "Txn ID",
    "ifsc_code":           "IFSC",
    "account_number":      "Account No.",
    "amount_inr":          "Amount",
    "payment_name":        "Sender Name",
    "email":               "Email",
    "phone":               "Phone",
    "phone_intl":          "Phone",
    "pincode":             "Pincode",
    "password":            "Password",
    "otp":                 "OTP",
}

FILTER_GROUPS = {
    "aadhaar": [
        "aadhaar_number", "aadhaar_labeled", "aadhaar_masked",
    ],
    "pan": [
        "pan_number",
    ],
    "id_card": [
        "roll_number",       
        "dob_labeled",      
        "voter_id",
        "dl_number",
        "passport_number",
        "mrz_line",
        "student_id",
        "library_id",
        "employee_id",
        
    ],
    "payment": [
        "card_number",
        "card_expiry",
        "card_cvv",
        "card_holder_labeled",
        "upi_id",
        "upi_txn_id",
        "google_txn_id",
        "transaction_id",
        "ifsc_code",
        "account_number",
        "amount_inr",
        "payment_name",
    ],
    "email":    ["email"],
    "phone":    ["phone", "phone_intl"],
    "password": ["password", "otp"],
    "dob":      ["dob_labeled", "dob_standalone"],
    "pincode":  ["pincode"],
}
def _load_image(image_path):
    img = cv2.imread(str(image_path))
    if img is not None:
        return img
    if HAS_PIL:
        try:
            pil = Image.open(image_path).convert("RGB")
            arr = np.array(pil)
            return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
        except Exception as e:
            print(f"[OCR] PIL load failed: {e}")
    return None


# =============================================================================
# PREPROCESSING — 5 versions
# v0  adaptive threshold   — printed ID cards, typed docs, screenshots
# v1  CLAHE enhanced       — faded / laminated / low-contrast cards
# v2  2× upscale+sharpen   — small embossed credit card text
# v3  inverted v0          — white text on dark background (dark cards)
# v4  inverted CLAHE       — dark card + low contrast
# =============================================================================
def _preprocess(image_path):
    img = _load_image(image_path)
    if img is None:
        print(f"[OCR] Cannot load: {image_path}")
        return [], (0, 0, 3)

    if len(img.shape) == 3 and img.shape[2] == 4:
        gray = cv2.cvtColor(img, cv2.COLOR_BGRA2GRAY)
    elif len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    h, w = gray.shape
    versions = []

    den = cv2.fastNlMeansDenoising(gray, h=10)
    v0  = cv2.adaptiveThreshold(den, 255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 31, 10)
    versions.append((v0, w, h))

    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    cl    = clahe.apply(gray)
    _, v1 = cv2.threshold(cl, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    versions.append((v1, w, h))

    up    = cv2.resize(gray, (w * 2, h * 2), interpolation=cv2.INTER_CUBIC)
    blur  = cv2.GaussianBlur(up, (0, 0), 3)
    sharp = cv2.addWeighted(up, 1.5, blur, -0.5, 0)
    _, v2 = cv2.threshold(sharp, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    versions.append((v2, w * 2, h * 2))

    v3 = cv2.bitwise_not(v0)
    versions.append((v3, w, h))

    v4 = cv2.bitwise_not(v1)
    versions.append((v4, w, h))

    return versions, img.shape


# =============================================================================
# OCR — 4 PSM modes
# =============================================================================
PSM_CONFIGS = [
    "--psm 6 --oem 3",
    "--psm 4 --oem 3",
    "--psm 11 --oem 3",
    "--psm 3 --oem 3",
]

def _ocr_lines(img_arr):
    all_lines = {}
    for cfg in PSM_CONFIGS:
        try:
            data = pytesseract.image_to_data(
                img_arr,
                output_type=pytesseract.Output.DICT,
                config=cfg, lang="eng"
            )
            for i, text in enumerate(data["text"]):
                if int(data["conf"][i]) < 10 or not text.strip():
                    continue
                key = (cfg,
                       data["block_num"][i],
                       data["par_num"][i],
                       data["line_num"][i])
                if key not in all_lines:
                    all_lines[key] = {
                        "words": [], "xs": [], "ys": [], "ws": [], "hs": []
                    }
                all_lines[key]["words"].append(text)
                all_lines[key]["xs"].append(data["left"][i])
                all_lines[key]["ys"].append(data["top"][i])
                all_lines[key]["ws"].append(data["width"][i])
                all_lines[key]["hs"].append(data["height"][i])
        except Exception as e:
            print(f"[OCR] {cfg} error: {e}")
    return all_lines


def _build_segments(lines_dict):
    groups = {}
    for key in sorted(lines_dict.keys()):
        g = (key[0], key[1])
        groups.setdefault(g, []).append(key)

    segments = []
    for g_keys in groups.values():
        for i, key in enumerate(g_keys):
            line = lines_dict[key]
            text = " ".join(line["words"])
            segments.append((text, line, None))
            if i + 1 < len(g_keys):
                nk = g_keys[i + 1]
                nl = lines_dict[nk]
                nt = " ".join(nl["words"])
                segments.append((text + " " + nt, line, nl))
    return segments


def _value_bbox(match, grp_idx, line, orig_w, orig_h, v_w, v_h, pad=5):
    try:
        if grp_idx and match.lastindex and match.lastindex >= grp_idx:
            v_start = match.start(grp_idx)
            v_end   = match.end(grp_idx)
        else:
            v_start = match.start(0)
            v_end   = match.end(0)
    except Exception:
        v_start = match.start(0)
        v_end   = match.end(0)

    cursor = 0
    mxs, mys, mws, mhs = [], [], [], []
    for j, word in enumerate(line["words"]):
        word_end = cursor + len(word)
        if word_end > v_start and cursor < v_end:
            mxs.append(line["xs"][j])
            mys.append(line["ys"][j])
            mws.append(line["ws"][j])
            mhs.append(line["hs"][j])
        cursor += len(word) + 1

    if not mxs:
        return None

    sx = orig_w / v_w
    sy = orig_h / v_h

    x1 = int(min(mxs) * sx)
    y1 = int(min(mys) * sy)
    x2 = int(max(x + ww for x, ww in zip(mxs, mws)) * sx)
    y2 = int(max(y + hh for y, hh in zip(mys, mhs)) * sy)

    return {
        "x": max(0, x1 - pad),
        "y": max(0, y1 - pad),
        "w": max(10, (x2 - x1) + 2 * pad),
        "h": max(10, (y2 - y1) + 2 * pad),
    }

def _has_card_context(all_segments):
    """Return True if OCR text suggests a payment card is in the image."""
    card_keywords = re.compile(
        r"(?i)(visa|master\s*card|rupay|amex|maestro|"
        r"\d{4}[\s\-]\d{4}[\s\-]\d{4}[\s\-]\d{4}|"
        r"(0[1-9]|1[0-2])\s*/\s*\d{2,4}|"
        r"valid\s*thru|good\s*thru|expires?)"
    )
    for (text, _, _) in all_segments:
        if card_keywords.search(text):
            return True
    return False

def extract_sensitive_boxes(image_path, filters):
    """
    Returns list of box dicts. Each covers ONLY the sensitive value.
    Labels (NAME:, ROLL NO:, BRANCH:) are never included in the box.
    """
    active = set()
    for grp, enabled in filters.items():
        if enabled and grp in FILTER_GROUPS:
            active.update(FILTER_GROUPS[grp])
    if not active:
        return []

    versions, orig_shape = _preprocess(image_path)
    if not versions:
        return []

    orig_h, orig_w = orig_shape[:2]
    all_boxes = []
    seen      = set()

    # First pass: collect all segments to check card context
    first_version   = versions[0][0]
    first_lines     = _ocr_lines(first_version)
    first_segments  = _build_segments(first_lines)
    is_payment_card = _has_card_context(first_segments)

    # Add card_holder_on_card only when payment card context confirmed
    effective_active = set(active)
    if "payment" in filters and filters["payment"] and is_payment_card:
        effective_active.add("card_holder_on_card")

    for (version, v_w, v_h) in versions:
        lines    = _ocr_lines(version)
        segments = _build_segments(lines)

        for (seg_text, line1, line2) in segments:
            if not seg_text.strip():
                continue

            for pat_key in effective_active:
                entry = PATTERN_DEFS.get(pat_key)
                if not entry:
                    continue
                pattern, grp_idx, needs_luhn = entry

                for match in re.finditer(pattern, seg_text):
                    try:
                        val = (match.group(grp_idx)
                               if grp_idx and match.lastindex
                               and match.lastindex >= grp_idx
                               else match.group(0))
                    except Exception:
                        val = match.group(0)

                    val   = val.strip()
                    clean = re.sub(r"[\s\-]", "", val)
                    if not clean or len(clean) < 3:
                        continue

                    if needs_luhn and not _luhn_check(clean):
                        continue

                    dedup = (pat_key, clean.upper())
                    if dedup in seen:
                        continue
                    seen.add(dedup)

                    line1_text = " ".join(line1["words"])
                    bbox = None

                    if line2 is not None:
                        try:
                            vs = (match.start(grp_idx)
                                  if grp_idx and match.lastindex
                                  and match.lastindex >= grp_idx
                                  else match.start(0))
                        except Exception:
                            vs = match.start(0)

                        if vs >= len(line1_text) + 1:
                            line2_text = " ".join(line2["words"])
                            for m2 in re.finditer(pattern, line2_text):
                                try:
                                    v2 = (m2.group(grp_idx)
                                          if grp_idx and m2.lastindex
                                          and m2.lastindex >= grp_idx
                                          else m2.group(0))
                                except Exception:
                                    v2 = m2.group(0)
                                if re.sub(r"[\s\-]", "", v2.strip()).upper() == clean.upper():
                                    bbox = _value_bbox(m2, grp_idx, line2,
                                                       orig_w, orig_h, v_w, v_h)
                                    break
                        else:
                            bbox = _value_bbox(match, grp_idx, line1,
                                               orig_w, orig_h, v_w, v_h)
                    else:
                        bbox = _value_bbox(match, grp_idx, line1,
                                           orig_w, orig_h, v_w, v_h)

                    if bbox:
                        all_boxes.append({
                            **bbox,
                            "label":         pat_key,
                            "display_label": LABEL_NAMES.get(pat_key, pat_key),
                            "value":         val,
                        })

    return all_boxes