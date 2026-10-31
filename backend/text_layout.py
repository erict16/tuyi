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
LEAD_FONT_RE = re.compile(r"^\{?\\f[^;\\]*;")
# A free-standing MTEXT may grow to this multiple of the Chinese width before
# it has to shrink, as long as that space is empty.
ROOM_CAP = 2.5


def _keep_mtext_baseline(entity, shrink: float) -> None:
    """Move a shrunk top/middle-attached MTEXT down so it stays on its baseline.

    MTEXT hangs from its insert point when attached at the top, so smaller text
    would float above the underline it was drawn on (CAXA detail labels).
    """
    if shrink <= 0 or entity.dxf.get("rotation", 0):
        return
    attach = int(entity.dxf.get("attachment_point", 1) or 1)
    drop = shrink if attach in {1, 2, 3} else shrink / 2 if attach in {4, 5, 6} else 0
    if drop:
        insert = entity.dxf.insert
        entity.dxf.insert = (insert.x, insert.y - drop, insert.z)


def _obstacles(layout) -> list[tuple[str, float, float, float, float]]:
    """(handle, xmin, ymin, xmax, ymax) of everything drawn in a layout.

    Blocks are exploded and lines/polylines are split into segments, so a sheet
    frame counts as four thin rules instead of one box around the whole drawing.
    """
    from ezdxf import bbox, disassemble

    found = []
    try:
        for entity in disassemble.recursive_decompose(layout):
            kind = entity.dxftype()
            handle = entity.dxf.get("handle", "") or ""
            if kind == "LINE":
                segments = [(entity.dxf.start, entity.dxf.end)]
            elif kind == "LWPOLYLINE":
                vertices = [entity.ocs().to_wcs((x, y, entity.dxf.elevation)) for x, y in entity.get_points("xy")]
                if entity.closed and vertices:
                    vertices.append(vertices[0])
                segments = list(zip(vertices, vertices[1:]))
            else:
                try:
                    ext = bbox.extents([entity])
                except Exception:
                    continue
                if ext.has_data:
                    found.append((handle, ext.extmin.x, ext.extmin.y, ext.extmax.x, ext.extmax.y))
                continue
            for start, end in segments:
                found.append((handle, min(start[0], end[0]), min(start[1], end[1]),
                              max(start[0], end[0]), max(start[1], end[1])))
    except Exception:
        return []
    return found


def _free_width(entity, height: float, used: float, cache: dict) -> float | None:
    """Width a left-attached MTEXT can take before it meets anything on its line.

    ``used`` is the width the Chinese occupied; the label may only grow into
    space that is empty along its whole height (no text, rule or frame).
    """
    if entity.dxf.get("rotation", 0):
        return None
    attach = int(entity.dxf.get("attachment_point", 1) or 1)
    if attach not in {1, 4, 7}:
        return None
    layout = entity.get_layout()
    if layout is None or not getattr(layout, "is_any_layout", False):
        return None
    key = layout.layout_key
    if key not in cache:
        cache[key] = _obstacles(layout)
    own = entity.dxf.get("handle", "")
    x, y = float(entity.dxf.insert.x), float(entity.dxf.insert.y)
    top = {1: y, 4: y + height / 2, 7: y + height}[attach]
    low = top - height
    edge = x + used
    walls = [max(xmin, edge) for handle, xmin, ymin, xmax, ymax in cache[key]
             if handle != own and ymax > low and ymin < top and xmax > edge]
    return min(walls) - x if walls else None


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


def _room_budget(entity, height: float, used: float, target: str, font, cache: dict) -> float | None:
    """Free width after a column-less MTEXT, in the same units as ``used``.

    ``used`` comes from the fallback CJK font, which runs wider than the font the
    drawing really renders with, so convert through the rendered width of the
    translation (ezdxf measures it with the entity's own style) before comparing
    with real geometry, then convert back.
    """
    from ezdxf.tools.text_size import mtext_size

    measured = font.text_width(target) * height
    try:
        rendered = mtext_size(entity).total_width
    except Exception:
        return None
    if measured <= 0 or rendered <= 0:
        return None
    scale = rendered / measured
    room = _free_width(entity, height, used * scale, cache)
    if room is None:
        return None
    return max(0.0, room - height) / scale


def fit_translated_labels(doc, rows) -> int:
    """Shrink only expanded CJK-to-Latin labels; never enlarge text or move geometry.

    A shrunk column-less MTEXT attached at the top or middle drops by the height
    it lost so it keeps its baseline. A column-less MTEXT (a sheet title) may
    first use the empty space after it on its line, up to the next text, rule
    or frame.

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
    obstacles: dict = {}
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
            # One font code at the start (CAXA writes \fPingFang SC Light|...; on
            # every title) styles the whole label, so it is still a single run.
            raw = LEAD_FONT_RE.sub("", entity.text, count=1)
            if re.search(r"\\[PHhWwFf]", raw) or "\n" in source or "\n" in target:
                continue
        height_key = "char_height" if is_mtext else "height"
        height = float(entity.dxf.get(height_key, 0) or 0)
        if height <= 0:
            continue
        width_factor = 1.0 if is_mtext else float(entity.dxf.get("width", 1) or 1)
        measured_room = False
        budget = font.text_width(source) * height * width_factor
        if is_mtext:
            column = float(entity.dxf.get("width", 0) or 0)
            if column > 0:
                # The column is the cell. Short CJK labels leave most of it empty,
                # so use it (as a hand-finished drawing does), but never more than
                # twice the original label so oversized MTEXT boxes stay safe.
                budget = min(column * 0.96, budget * 2)
            else:
                # No column: a drawing title, say. It may run on into empty
                # space up to whatever comes next on its line (often the sheet
                # frame), so it never crosses the border as an unfitted title did.
                room = _room_budget(entity, height, budget, target, font, obstacles)
                if room is not None:
                    budget = max(budget, min(room, budget * ROOM_CAP))
                    measured_room = True
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
        if is_mtext:
            # A measured free line already keeps one text height clear.
            height_scale = ratio * (0.97 if measured_room else 0.9)
        else:
            height_scale = max(0.65, math.sqrt(ratio))
        entity.dxf.set(height_key, height * height_scale)
        if is_mtext and not float(entity.dxf.get("width", 0) or 0):
            # A column note keeps its top anchor; a free label keeps its line.
            _keep_mtext_baseline(entity, height - height * height_scale)
        if not is_mtext and entity.dxf.get("halign", 0) not in {3, 5}:
            entity.dxf.width = width_factor * ratio / height_scale
        changed += 1
    return changed
