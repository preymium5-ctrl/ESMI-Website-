"""Export the approved Google Flow ESMI mark and outlined Manrope wordmark.

Reads persisted source geometry so exports never regenerate or redesign the mark.
Requires the already available fontTools and Pillow packages. No network access.
"""
from __future__ import annotations

import json
import math
from pathlib import Path
from xml.sax.saxutils import escape

from fontTools.pens.basePen import BasePen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.svgLib.path import parse_path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "film-v3"
GEOMETRY = OUT / "esmi-mark-geometry.json"
PALETTE = {
    "dark": {"word": "#073e4b"},
    "light": {"word": "#ffffff"},
}


def transformed_path(draw, transform):
    pen = SVGPathPen(None)
    draw(TransformPen(pen, transform))
    return pen.getCommands()


class PolygonPen(BasePen):
    def __init__(self, image, factor):
        super().__init__(None)
        self.draw = ImageDraw.Draw(image)
        self.factor = factor
        self.points = []

    def _moveTo(self, pt):
        self.points = [pt]

    def _lineTo(self, pt):
        self.points.append(pt)

    def _curveToOne(self, p1, p2, p3):
        p0 = self._getCurrentPoint()
        for i in range(1, 49):
            t = i / 48
            s = 1 - t
            self.points.append(tuple(s**3*p0[k]+3*s*s*t*p1[k]+3*s*t*t*p2[k]+t**3*p3[k] for k in (0, 1)))

    def _qCurveToOne(self, p1, p2):
        p0 = self._getCurrentPoint()
        for i in range(1, 33):
            t = i / 32
            s = 1 - t
            self.points.append(tuple(s*s*p0[k]+2*s*t*p1[k]+t*t*p2[k] for k in (0, 1)))

    def _closePath(self):
        self.draw.polygon([(x*self.factor, y*self.factor) for x, y in self.points], fill=255)
        self.points = []

    def _endPath(self):
        self._closePath()


def rgb(value):
    return tuple(int(value[i:i+2], 16) for i in (1, 3, 5))


def render_png(path, mark_pieces, word_paths, width, height, palette, output_width=2400):
    factor = output_width / width
    # Supersampling preserves the exact SVG contours and transparent edges.
    oversample = 2
    raster_factor = factor * oversample
    size = (round(width*raster_factor), round(height*raster_factor))
    word_mask = Image.new("L", size)
    for d in word_paths:
        parse_path(d, PolygonPen(word_mask, raster_factor))
    image = Image.new("RGBA", size)
    for piece in mark_pieces:
        mask = Image.new("L", size)
        parse_path(piece["d"], PolygonPen(mask, raster_factor))
        color = Image.new("RGBA", size, rgb(piece["fill"]) + (255,))
        image.paste(color, (0, 0), mask)
    if word_paths:
        word = Image.new("RGBA", size, rgb(palette["word"]) + (255,))
        image.paste(word, (0, 0), word_mask)
    image = image.resize((output_width, round(height*factor)), Image.Resampling.LANCZOS)
    image.save(path, optimize=True)


def parse_bound(d):
    pen = BoundsPen(None)
    parse_path(d, pen)
    return pen.bounds


def make_svg(mark_pieces, word_paths, width, height, palette, label):
    wave_markup = "".join(f'<path data-piece="{p["id"]}" data-wave="{p["wave"]}" fill="{p["fill"]}" d="{escape(p["d"])}"/>' for p in mark_pieces)
    word_markup = "".join(f'<path class="esmi-logo-letter" data-letter="{letter}" d="{escape(d)}"/>' for letter, d in zip("ESMI", word_paths))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" id="esmi-logo" viewBox="0 0 {width} {height}" role="img" aria-labelledby="esmi-logo-title">
  <title id="esmi-logo-title">{label}</title>
  <g class="esmi-logo-mark">{wave_markup}</g>
  <g class="esmi-logo-word" fill="{palette['word']}">{word_markup}</g>
</svg>
'''


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    geometry = json.loads(GEOMETRY.read_text(encoding="utf-8"))
    _, _, source_width, source_height = geometry["viewBox"]
    source_pieces = geometry["pieces"]
    if len(source_pieces) != 5:
        raise ValueError("The approved Flow artwork must retain all 5 pieces")
    font = instantiateVariableFont(TTFont(ROOT / "assets" / "manrope.woff2"), {"wght": 800}, inplace=False)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    unit_scale = 132 / font["head"].unitsPerEm
    tracking = -132 * .04
    glyph_bounds = []
    for letter in "ESMI":
        pen = BoundsPen(glyphs)
        glyphs[cmap[ord(letter)]].draw(pen)
        glyph_bounds.append(pen.bounds)
    cap_height = max(b[3] for b in glyph_bounds) * unit_scale
    bottom = min(b[1] for b in glyph_bounds) * unit_scale
    pad, wave_width, gap = 24, 120, 26
    wave_scale = wave_width / source_width
    wave_height = source_height * wave_scale
    height = math.ceil(max(wave_height, cap_height-bottom) + 2*pad)
    baseline = (height+cap_height+bottom)/2
    word_x = pad + wave_width + gap
    wave_y = (height-wave_height)/2
    mark_pieces = [{**p, "d": transformed_path(lambda pen, d=p["d"]: parse_path(d, pen), (wave_scale, 0, 0, wave_scale, pad, wave_y))} for p in source_pieces]
    word_paths = []
    cursor = word_x
    for letter in "ESMI":
        name = cmap[ord(letter)]
        word_paths.append(transformed_path(glyphs[name].draw, (unit_scale, 0, 0, -unit_scale, cursor, baseline)))
        cursor += font['hmtx'].metrics[name][0] * unit_scale + tracking
    word_right = max(parse_bound(d)[2] for d in word_paths)
    width = math.ceil(word_right + pad)
    for variant, filename in (("dark", "esmi-logo"), ("light", "esmi-logo-light")):
        palette = PALETTE[variant]
        (OUT / f"{filename}.svg").write_text(make_svg(mark_pieces, word_paths, width, height, palette, "ESMI"), encoding="utf-8")
        render_png(OUT / f"{filename}.png", mark_pieces, word_paths, width, height, palette)
    mark_width, mark_height = 144, 94
    mark_y = (mark_height-wave_height)/2
    standalone_pieces = [{**p, "d": transformed_path(lambda pen, d=p["d"]: parse_path(d, pen), (wave_scale, 0, 0, wave_scale, 12, mark_y))} for p in source_pieces]
    (OUT / "esmi-mark.svg").write_text(make_svg(standalone_pieces, [], mark_width, mark_height, PALETTE["dark"], "ESMI wave mark"), encoding="utf-8")
    render_png(OUT / "esmi-mark.png", standalone_pieces, [], mark_width, mark_height, PALETTE["dark"], 1200)
    manifest = {
        "source": "Approved Google Flow artwork; five source contours exported as vector paths",
        "provenance": geometry["source"],
        "geometry": GEOMETRY.relative_to(ROOT).as_posix(),
        "export": geometry["export"],
        "wordmark": "Outlined paths; no external font dependency",
        "lockupViewBox": [0, 0, width, height],
        "markViewBox": [0, 0, mark_width, mark_height],
        "pngWidth": 2400,
        "background": "transparent",
        "markSizeInLockup": [wave_width, wave_height],
        "palette": {"mark": {p["id"]: p["fill"] for p in source_pieces}, "wordmark": PALETTE},
        "files": ["esmi-logo.svg", "esmi-logo.png", "esmi-logo-light.svg", "esmi-logo-light.png", "esmi-mark.svg", "esmi-mark.png"],
        "rebuild": "python scripts/build-esmi-logo.py",
    }
    (OUT / "brand-assets.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
