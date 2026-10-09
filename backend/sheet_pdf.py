"""Find stacked sheet frames in model space.

CMA7-style drawings keep every sheet in model space and leave paper layouts
empty. Fitting that whole model onto one page throws away the wiring.
"""

from __future__ import annotations

import sys
from pathlib import Path
from statistics import median

import ezdxf
from ezdxf import bbox

_MIN_FRAME = 50.0
_fonts_ready = False


def cad_font_dirs() -> list[str]:
    """SHX folders shipped with ZWCAD / AutoCAD. Missing folders are skipped."""
    found: list[str] = []
    if sys.platform != "win32":
        return found
    roots = [Path(r"C:\Program Files"), Path(r"C:\Program Files (x86)")]
    patterns = ("ZWCAD*/**/fonts", "Autodesk/AutoCAD*/Fonts")
    for root in roots:
        if not root.is_dir():
            continue
        for pattern in patterns:
            for folder in root.glob(pattern):
                if folder.is_dir():
                    found.append(str(folder))
    windows = Path(r"C:\Windows\Fonts")
    if windows.is_dir():
        found.append(str(windows))
    return found


def register_cad_fonts() -> None:
    """Make real SHX / bigfont files win over the Noto stand-in for txt.shx."""
    global _fonts_ready
    if _fonts_ready:
        return
    folders = cad_font_dirs()
    if not folders:
        _fonts_ready = True
        return
    from ezdxf.fonts import fonts as ez_fonts

    ez_fonts.font_manager.scan_all(folders)
    _fonts_ready = True


def paperspace_has_entities(doc) -> bool:
    for layout in doc.layouts:
        if not layout.is_any_paperspace:
            continue
        try:
            if next(iter(layout), None) is not None:
                return True
        except Exception:
            continue
    return False


def _box_of(ext) -> tuple[float, float, float, float] | None:
    if ext is None or not ext.has_data:
        return None
    xmin, ymin = float(ext.extmin.x), float(ext.extmin.y)
    xmax, ymax = float(ext.extmax.x), float(ext.extmax.y)
    if xmax - xmin < _MIN_FRAME or ymax - ymin < _MIN_FRAME:
        return None
    return (xmin, ymin, xmax, ymax)


def _same_size(boxes: list[tuple[float, float, float, float]]) -> bool:
    widths = [box[2] - box[0] for box in boxes]
    heights = [box[3] - box[1] for box in boxes]
    med_w = median(widths)
    med_h = median(heights)
    if med_w <= 0 or med_h <= 0:
        return False
    return all(abs(w - med_w) <= 0.08 * med_w and abs(h - med_h) <= 0.08 * med_h for w, h in zip(widths, heights))


def _is_column(boxes: list[tuple[float, float, float, float]]) -> bool:
    ordered = sorted(boxes, key=lambda box: -((box[1] + box[3]) / 2))
    med_w = median(box[2] - box[0] for box in ordered)
    med_h = median(box[3] - box[1] for box in ordered)
    centers_x = [(box[0] + box[2]) / 2 for box in ordered]
    if max(centers_x) - min(centers_x) > 0.25 * med_w:
        return False
    for above, below in zip(ordered, ordered[1:]):
        if above[1] - below[3] < -0.08 * med_h:
            return False
        delta = abs(((above[1] + above[3]) - (below[1] + below[3])) / 2)
        if not (0.7 * med_h <= delta <= 1.8 * med_h):
            return False
    return True


def _is_row(boxes: list[tuple[float, float, float, float]]) -> bool:
    ordered = sorted(boxes, key=lambda box: (box[0] + box[2]) / 2)
    med_w = median(box[2] - box[0] for box in ordered)
    med_h = median(box[3] - box[1] for box in ordered)
    centers_y = [(box[1] + box[3]) / 2 for box in ordered]
    if max(centers_y) - min(centers_y) > 0.25 * med_h:
        return False
    for left, right in zip(ordered, ordered[1:]):
        if right[0] - left[2] < -0.08 * med_w:
            return False
        delta = abs(((left[0] + left[2]) - (right[0] + right[2])) / 2)
        if not (0.7 * med_w <= delta <= 1.8 * med_w):
            return False
    return True


def sheet_frames(doc) -> list[tuple[float, float, float, float]]:
    """World boxes of a repeated title frame, top-to-bottom, then left-to-right."""
    groups: dict[str, list[tuple[float, float, float, float]]] = {}
    cache = bbox.Cache()
    try:
        inserts = list(doc.modelspace().query("INSERT"))
    except Exception:
        return []
    for entity in inserts:
        name = str(getattr(entity.dxf, "name", "") or "")
        if not name or name.startswith("*"):
            continue
        try:
            ext = bbox.extents([entity], cache=cache)
        except Exception:
            continue
        box = _box_of(ext)
        if box is None:
            continue
        groups.setdefault(name, []).append(box)

    best: list[tuple[float, float, float, float]] = []
    best_area = 0.0
    for boxes in groups.values():
        if len(boxes) < 2 or not _same_size(boxes):
            continue
        if not (_is_column(boxes) or _is_row(boxes)):
            continue
        area = median((box[2] - box[0]) * (box[3] - box[1]) for box in boxes)
        if area > best_area:
            best_area = area
            best = boxes
    best.sort(key=lambda box: (-box[3], box[0]))
    return best


def _overlaps(box, other, pad: float) -> bool:
    return not (
        box[2] < other[0] - pad
        or box[0] > other[2] + pad
        or box[3] < other[1] - pad
        or box[1] > other[3] + pad
    )


def entities_in_frame(doc, frame: tuple[float, float, float, float]):
    cache = bbox.Cache()
    picked = []
    span_x = frame[2] - frame[0]
    span_y = frame[3] - frame[1]
    for entity in doc.modelspace():
        try:
            ext = bbox.extents([entity], cache=cache)
        except Exception:
            picked.append(entity)
            continue
        if not ext.has_data:
            picked.append(entity)
            continue
        other = (float(ext.extmin.x), float(ext.extmin.y), float(ext.extmax.x), float(ext.extmax.y))
        if (other[2] - other[0]) > span_x * 4 and (other[3] - other[1]) > span_y * 4:
            continue
        if _overlaps(frame, other, 2.0):
            picked.append(entity)
    return picked


def frame_document(source, frame: tuple[float, float, float, float]):
    """A drawing that holds only this sheet. None if the copy fails."""
    entities = entities_in_frame(source, frame)
    if not entities:
        return None
    try:
        target = ezdxf.new(source.dxfversion)
        from ezdxf.addons.importer import Importer

        importer = Importer(source, target)
        importer.import_entities(entities, target.modelspace())
        importer.finalize()
    except Exception:
        return None
    return target
