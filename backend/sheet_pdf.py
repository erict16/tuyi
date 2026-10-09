"""One print page per stacked sheet frame.

CMA7-style drawings keep every sheet in model space (empty paper layouts).
Fitting that whole model onto one matplotlib page throws away the wiring.
This module finds the repeated title frames and plots each one on its own
A4 landscape page, with CAD SHX strokes instead of a TTF stand-in.
"""

from __future__ import annotations

import sys
from pathlib import Path
from statistics import median

import ezdxf
from ezdxf import bbox

A4_LANDSCAPE_IN = (297 / 25.4, 210 / 25.4)
_PAPER_ASPECT = A4_LANDSCAPE_IN[0] / A4_LANDSCAPE_IN[1]
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
    """World boxes of a repeated title frame, top-to-bottom, then left-to-right.

    Empty when model space is a normal single sheet.
    """
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


def _entities_in_frame(doc, frame: tuple[float, float, float, float]):
    cache = bbox.Cache()
    picked = []
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
        # A span bigger than the whole stack is a construction line, not this sheet.
        if (other[2] - other[0]) > (frame[2] - frame[0]) * 4 and (other[3] - other[1]) > (frame[3] - frame[1]) * 4:
            continue
        if _overlaps(frame, other, 2.0):
            picked.append(entity)
    return picked


def _frame_document(source, entities):
    target = ezdxf.new(source.dxfversion)
    from ezdxf.addons.importer import Importer

    importer = Importer(source, target)
    importer.import_entities(entities, target.modelspace())
    importer.finalize()
    return target


def _paper_window(frame: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    """Fit the frame on A4 landscape with a small margin, equal scale."""
    xmin, ymin, xmax, ymax = frame
    width = xmax - xmin
    height = ymax - ymin
    if width <= 0 or height <= 0:
        return frame
    if width / height < _PAPER_ASPECT:
        fitted = height * _PAPER_ASPECT
        pad = (fitted - width) / 2
        xmin -= pad
        xmax += pad
    else:
        fitted = width / _PAPER_ASPECT
        pad = (fitted - height) / 2
        ymin -= pad
        ymax += pad
    margin_x = (xmax - xmin) * 0.035
    margin_y = (ymax - ymin) * 0.035
    return (xmin - margin_x, ymin - margin_y, xmax + margin_x, ymax + margin_y)


def _draw_model(layout, ax, appearance: str) -> None:
    from ezdxf.addons.drawing import Frontend
    from ezdxf.addons.drawing.config import BackgroundPolicy, ColorPolicy, Configuration
    from ezdxf.addons.drawing.matplotlib import MatplotlibBackend
    from ezdxf.addons.drawing.properties import LayoutProperties, RenderContext

    mono = appearance != "彩色"
    ctx = RenderContext(layout.doc)
    props = LayoutProperties.from_layout(layout)
    props.set_colors("#ffffff")
    config = Configuration(
        color_policy=ColorPolicy.BLACK if mono else ColorPolicy.COLOR,
        background_policy=BackgroundPolicy.CUSTOM,
        custom_bg_color="#ffffff",
    )
    backend = MatplotlibBackend(ax, adjust_figure=False)
    Frontend(ctx, backend, config).draw_layout(layout, finalize=True, layout_properties=props)
    ax.set_aspect("auto")
    ax.autoscale(False)
    figure = ax.get_figure()
    figure.patch.set_facecolor("white")
    ax.set_facecolor("white")


def render_sheet_pages(doc, frames: list[tuple[float, float, float, float]], dest, appearance: str) -> int:
    """Write one A4 page per frame. Returns the page count."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_pdf import PdfPages

    from backend.storage import atomic_output_path

    register_cad_fonts()
    with atomic_output_path(str(dest)) as temporary, PdfPages(temporary) as pdf:
        for frame in frames:
            page_doc = _frame_document(doc, _entities_in_frame(doc, frame))
            fig = plt.figure(figsize=A4_LANDSCAPE_IN, dpi=72)
            ax = fig.add_axes((0, 0, 1, 1))
            try:
                _draw_model(page_doc.modelspace(), ax, appearance)
                xmin, ymin, xmax, ymax = _paper_window(frame)
                ax.set_aspect("auto")
                ax.autoscale(False)
                ax.set_xlim(xmin, xmax)
                ax.set_ylim(ymin, ymax)
                fig.set_size_inches(*A4_LANDSCAPE_IN, forward=True)
                pdf.savefig(fig, facecolor="white")
            finally:
                plt.close(fig)
    return len(frames)
