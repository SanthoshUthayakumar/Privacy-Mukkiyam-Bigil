from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import os
import datetime

try:
    import piexif
    HAS_PIEXIF = True
except ImportError:
    HAS_PIEXIF = False

CATEGORY_MAP = {
    "GPSInfo": "gps", "GPSLatitude": "gps", "GPSLongitude": "gps",
    "GPSAltitude": "gps", "GPSDateStamp": "gps", "GPSTimeStamp": "gps",
    "DateTime": "timestamp", "DateTimeOriginal": "timestamp", "DateTimeDigitized": "timestamp",
    "Make": "device", "Model": "device", "CameraSerialNumber": "device",
    "LensSerialNumber": "device", "BodySerialNumber": "device",
    "HostComputer": "device", "MakerNote": "device", "SerialNumber": "device",
    "Software": "software",
    "Artist": "author", "Copyright": "author", "OwnerName": "author",
    "XPAuthor": "author",
    "ImageDescription": "description", "UserComment": "description",
    "XPComment": "description", "XPTitle": "description",
    "ExifVersion": "technical", "ColorSpace": "technical",
    "ExifImageWidth": "technical", "ExifImageHeight": "technical",
    "FocalLength": "technical", "FNumber": "technical",
    "ExposureTime": "technical", "ISOSpeedRatings": "technical",
    "Flash": "technical", "WhiteBalance": "technical",
    "Orientation": "technical", "ResolutionUnit": "technical",
    "XResolution": "technical", "YResolution": "technical",
}

CATEGORY_LABELS = {
    "gps":         {"label": "GPS / Location",     "icon": "📍", "risk": "high"},
    "timestamp":   {"label": "Date & Time",         "icon": "🕐", "risk": "medium"},
    "device":      {"label": "Device / Camera",     "icon": "📱", "risk": "medium"},
    "software":    {"label": "Software",            "icon": "🖥",  "risk": "low"},
    "author":      {"label": "Author / Owner",      "icon": "👤", "risk": "high"},
    "description": {"label": "Description / Notes", "icon": "📝", "risk": "medium"},
    "technical":   {"label": "Technical Details",   "icon": "⚙",  "risk": "low"},
    "file":        {"label": "File Properties",     "icon": "📄", "risk": "low"},
    "other":       {"label": "Other Metadata",      "icon": "🔢", "risk": "low"},
}


def _to_degrees(value):
    try:
        d = value[0][0] / value[0][1]
        m = value[1][0] / value[1][1]
        s = value[2][0] / value[2][1]
        return d + (m / 60.0) + (s / 3600.0)
    except Exception:
        return None


def _decode_gps(gps_info):
    try:
        gps = {GPSTAGS.get(k, k): v for k, v in gps_info.items()}
        lat = _to_degrees(gps.get("GPSLatitude", []))
        lon = _to_degrees(gps.get("GPSLongitude", []))
        if lat is None or lon is None:
            return None
        if gps.get("GPSLatitudeRef", "N") == "S": lat = -lat
        if gps.get("GPSLongitudeRef", "E") == "W": lon = -lon
        return f"{lat:.6f}° {'N' if lat >= 0 else 'S'}, {lon:.6f}° {'E' if lon >= 0 else 'W'}"
    except Exception:
        return None


def _safe_str(value):
    if isinstance(value, bytes):
        try:
            decoded = value.decode("utf-8", errors="ignore").strip("\x00").strip()
            return decoded if decoded else value.hex()[:60]
        except:
            return value.hex()[:60]
    if isinstance(value, tuple):
        if len(value) == 2 and all(isinstance(v, int) for v in value):
            try:    return str(round(value[0] / value[1], 4))
            except: return str(value)
        return ", ".join(_safe_str(v) for v in value)
    return str(value)


def _add_field(result, tag, value, category):
    cat_info = CATEGORY_LABELS.get(category, {"risk": "low"})
    result["fields"].append({
        "tag":      tag,
        "value":    str(value)[:300],
        "category": category,
        "risk":     cat_info.get("risk", "low"),
    })


def extract_metadata(image_path):
    result = {
        "fields": [], "gps_string": None,
        "has_gps": False, "total": 0,
        "by_category": {}, "file_info": {},
    }

    
    try:
        stat = os.stat(image_path)
        img  = Image.open(image_path)

        size_kb  = round(stat.st_size / 1024, 1)
        fmt      = img.format or os.path.splitext(image_path)[1].upper().strip(".")
        modified = datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")
        created  = datetime.datetime.fromtimestamp(stat.st_ctime).strftime("%Y-%m-%d %H:%M:%S")

        result["file_info"] = {
            "size_kb": size_kb,
            "format":  fmt,
            "mode":    img.mode,
            "width":   img.width,
            "height":  img.height,
        }

        # Always add these — every image has them
        _add_field(result, "File Format",      fmt,                    "file")
        _add_field(result, "File Size",        f"{size_kb} KB",        "file")
        _add_field(result, "Dimensions",       f"{img.width}×{img.height} px", "file")
        _add_field(result, "Color Mode",       img.mode,               "file")
        _add_field(result, "File Modified",    modified,               "timestamp")
        _add_field(result, "File Created",     created,                "timestamp")
        _add_field(result, "Absolute Path",    os.path.abspath(image_path), "file")

    except Exception as e:
        print(f"[Metadata] File read error: {e}")
        return result

    # ── EXIF via PIL (JPEG/TIFF cameras) ─────────────────────────────────────
    exif_found = False
    try:
        raw_exif = img._getexif()
        if raw_exif:
            exif_found = True
            for tag_id, value in raw_exif.items():
                tag = TAGS.get(tag_id, str(tag_id))
                if tag == "GPSInfo" and isinstance(value, dict):
                    gps_str = _decode_gps(value)
                    if gps_str:
                        result["gps_string"] = gps_str
                        result["has_gps"]    = True
                        _add_field(result, "GPS Coordinates", gps_str, "gps")
                    continue
                if isinstance(value, bytes) and len(value) > 200:
                    _add_field(result, tag, f"[Binary data {len(value)} bytes]", "technical")
                    continue
                _add_field(result, tag, _safe_str(value), CATEGORY_MAP.get(tag, "other"))
    except Exception:
        pass

    # ── piexif fallback ───────────────────────────────────────────────────────
    if HAS_PIEXIF:
        try:
            exif_dict = piexif.load(image_path)
            for ifd_name in ("0th", "Exif", "GPS", "1st"):
                for tag_id, value in exif_dict.get(ifd_name, {}).items():
                    if ifd_name == "GPS":
                        tag = GPSTAGS.get(tag_id, str(tag_id))
                        cat = "gps"
                    else:
                        tag = TAGS.get(tag_id, str(tag_id))
                        cat = CATEGORY_MAP.get(tag, "other")
                    if any(f["tag"] == tag for f in result["fields"]):
                        continue
                    if isinstance(value, bytes) and len(value) > 200:
                        continue
                    _add_field(result, tag, _safe_str(value), cat)
                    exif_found = True
        except Exception:
            pass

    # ── PNG text / metadata chunks ────────────────────────────────────────────
    try:
        info = img.info or {}
        for k, v in info.items():
            tag = f"PNG:{k}"
            if any(f["tag"] == tag for f in result["fields"]):
                continue
            if isinstance(v, bytes) and len(v) > 200:
                continue
            cat = "description" if k.lower() in ("comment", "description", "author", "title") else "other"
            _add_field(result, tag, str(v)[:200], cat)
    except Exception:
        pass

    # ── If truly no EXIF, note it ────────────────────────────────────────────
    if not exif_found:
        _add_field(result, "EXIF Data", "None embedded (screenshot or web image)", "technical")

    # ── Group by category ─────────────────────────────────────────────────────
    by_cat = {}
    for field in result["fields"]:
        cat = field["category"]
        if cat not in by_cat:
            meta = CATEGORY_LABELS.get(cat, {"label": cat, "icon": "🔢", "risk": "low"})
            by_cat[cat] = {**meta, "fields": []}
        by_cat[cat]["fields"].append(field)

    result["by_category"] = by_cat
    result["total"]       = len(result["fields"])
    return result


def strip_metadata(input_path, output_path):
    """
    Strip ALL metadata. Always reports what was found before stripping.
    Works for PNG screenshots (no EXIF) and JPEG camera photos (full EXIF).
    """
    before_size = os.path.getsize(input_path)
    meta_before = extract_metadata(input_path)   # capture before stripping

    img = Image.open(input_path)

    # Convert mode if saving as JPEG
    save_mode = img.mode
    if save_mode in ("RGBA", "P") and output_path.lower().endswith((".jpg", ".jpeg")):
        img       = img.convert("RGB")
        save_mode = "RGB"

    # Rebuild pixel-by-pixel — zero metadata in output
    clean = Image.new(save_mode, img.size)
    clean.putdata(list(img.getdata()))

    # Save with no extra info
    save_kwargs = {}
    if output_path.lower().endswith((".jpg", ".jpeg")):
        save_kwargs = {"quality": 95, "optimize": True}
    clean.save(output_path, **save_kwargs)

    after_size    = os.path.getsize(output_path)
    fields_removed = meta_before["total"]

    return {
        "stripped":        True,
        "fields_removed":  fields_removed,
        "gps_removed":     meta_before["has_gps"],
        "gps_string":      meta_before.get("gps_string"),
        "size_before_kb":  round(before_size / 1024, 1),
        "size_after_kb":   round(after_size  / 1024, 1),
        "saved_kb":        round((before_size - after_size) / 1024, 1),
        "by_category":     meta_before["by_category"],
        "fields":          meta_before["fields"],
        "file_info":       meta_before["file_info"],
        "total":           fields_removed,
        "has_gps":         meta_before["has_gps"],
    }