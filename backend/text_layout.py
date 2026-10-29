"""Keep translated single-line labels inside their original drawing footprint."""
from __future__ import annotations

import math
import re

from backend.styles import CJK_RE, register_cjk_font

# Long title-block names that read better as two lines than squeezed into one.
# The cell beside the HM logo is about 2.5x the CJK text height, so two lines
# at 62% of that height fit without touching the rules above or below.
TWO_LINE_LABELS = {
    "Shanghai Huaming Power Equipment Co., Ltd.": ("Shanghai Huaming Power", "Equipment Co., Ltd."),
}
TWO_LINE_HEIGHT = 0.62
TWO_LINE_PITCH = 1.6


def _split_two_lines(entity, font, lines, budget, height, width_factor) -> bool:
    """Stack a TEXT label as two lines centred on its original band."""
    from ezdxf.enums import TextEntityAlignment

    dxf = entity.dxf
    halign = dxf.get("halign", 0)
    if dxf.get("valign", 0) or dxf.get("rotation", 0) or halign == 4:
        return False
    if halign in {1, 2}:
        x, base = dxf.align_point.x, dxf.align_point.y
        align = TextEntityAlignment.CENTER if halign == 1 else TextEntityAlignment.RIGHT
    else:
        # Left, ALIGNED and FIT all start at the insert point.
        x, base = dxf.insert.x, dxf.insert.y
        align = TextEntityAlignment.LEFT
    line_height = height * TWO_LINE_HEIGHT
    if align == TextEntityAlignment.LEFT:
        # The taller first line would otherwise touch the logo's ® mark.
        indent = line_height * 0.3
        x += indent
        budget -= indent
    pitch = line_height * TWO_LINE_PITCH
    widest = max(font.text_width(line) for line in lines) * line_height * width_factor
    if widest > budget:
        width_factor *= budget / widest
    top = base + height / 2 + pitch / 2 - line_height / 2
    layout = entity.get_layout()
    if layout is None:
        return False
    second = entity.copy()
    layout.add_entity(second)
    for text, line, baseline in ((entity, lines[0], top), (second, lines[1], top - pitch)):
        text.dxf.text = line
        text.dxf.height = line_height
        text.dxf.width = width_factor
        text.set_placement((x, baseline), align=align)
    return True


def fit_translated_labels(doc, rows) -> int:
    """Shrink only expanded CJK-to-Latin labels; never enlarge text or move geometry.

    The original text width is the safe budget for TEXT. MTEXT also respects its
    explicit column width, so a longer translation cannot create extra lines on
    top of the next annotation. Rich height/width/font runs and multiline notes
    are left intact because their runs need a separate layout decision.
    FIT/ALIGNED text that got shorter is left-aligned instead of stretched, and
    the names in TWO_LINE_LABELS are stacked as two lines instead of squeezed.
    """
    from ezdxf.enums import TextEntityAlignment
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
                # The column is the cell. Short CJK labels leave most of it empty,
                # so use it (as a hand-finished drawing does), but never more than
                # twice the original label so oversized MTEXT boxes stay safe.
                budget = min(column * 0.96, budget * 2)
        elif entity.dxf.get("halign", 0) in {3, 5}:
            span = (entity.dxf.align_point - entity.dxf.insert).magnitude
            if span > 0:
                budget = span
        needed = font.text_width(target) * height * width_factor
        if not needed or not budget:
            continue
        stretched = not is_mtext and entity.dxf.get("halign", 0) in {3, 5}
        if needed <= budget:
            if stretched and needed < budget:
                # FIT/ALIGNED would stretch a short code such as "OLTC" across
                # the whole width the Chinese took; keep it at its own width.
                entity.set_placement(entity.dxf.insert, align=TextEntityAlignment.LEFT)
                changed += 1
            continue
        lines = TWO_LINE_LABELS.get(target)
        if (lines and kind == "TEXT"
                and _split_two_lines(entity, font, lines, budget, height, width_factor)):
            changed += 1
            continue
        ratio = budget / needed
        height_scale = ratio * 0.9 if is_mtext else max(0.65, math.sqrt(ratio))
        entity.dxf.set(height_key, height * height_scale)
        if not is_mtext and entity.dxf.get("halign", 0) not in {3, 5}:
            entity.dxf.width = width_factor * ratio / height_scale
        changed += 1
    return changed
