"""Keep translated single-line labels inside their original drawing footprint."""
from __future__ import annotations

import math
import re

from backend.styles import CJK_RE, register_cjk_font


def fit_translated_labels(doc, rows) -> int:
    """Shrink only expanded CJK-to-Latin labels; never enlarge text or move geometry.

    The original text width is the safe budget for TEXT. MTEXT also respects its
    explicit column width, so a longer translation cannot create extra lines on
    top of the next annotation. Rich height/width/font runs and multiline notes
    are left intact because their runs need a separate layout decision.
    """
    from ezdxf.fonts import fonts

    font_path = register_cjk_font()
    if font_path is None:
        return 0
    font = fonts.make_font(str(font_path), cap_height=1.0)
    changed = 0
    seen = set()
    for row in rows:
        handle = row.get("handle") or ""
        source = row.get("source") or ""
        target = row.get("target") or ""
        if (handle in seen or row.get("field", "text") != "text"
                or not CJK_RE.search(source) or CJK_RE.search(target) or not target):
            continue
        entity = doc.entitydb.get(handle)
        if entity is None or entity.dxftype() not in {"TEXT", "ATTRIB", "ATTDEF", "MTEXT"}:
            continue
        seen.add(handle)
        kind = entity.dxftype()
        is_mtext = kind == "MTEXT"
        if is_mtext:
            raw = entity.text
            if re.search(r"\\[PHhWwFf]", raw) or "\n" in source or "\n" in target:
                continue
        height_key = "char_height" if is_mtext else "height"
        height = float(entity.dxf.get(height_key, 0) or 0)
        if height <= 0:
            continue
        width_factor = 1.0 if is_mtext else float(entity.dxf.get("width", 1) or 1)
        budget = font.text_width(source) * height * width_factor
        if is_mtext:
            column = float(entity.dxf.get("width", 0) or 0)
            if column > 0:
                budget = min(budget, column * 0.96)
        elif entity.dxf.get("halign", 0) in {3, 5}:
            span = (entity.dxf.align_point - entity.dxf.insert).magnitude
            if span > 0:
                budget = span
        needed = font.text_width(target) * height * width_factor
        if not needed or not budget or needed <= budget:
            continue
        ratio = budget / needed
        height_scale = ratio * 0.9 if is_mtext else max(0.65, math.sqrt(ratio))
        entity.dxf.set(height_key, height * height_scale)
        if not is_mtext and entity.dxf.get("halign", 0) not in {3, 5}:
            entity.dxf.width = width_factor * ratio / height_scale
        changed += 1
    return changed
