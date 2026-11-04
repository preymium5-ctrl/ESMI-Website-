# Builds every logo asset of the site from one traced mark (made by scripts/trace-logo.py):
#   assets/film-v3/esmi-mark.svg          header mark, browser-tab icon, film end-card image
#   assets/film-v3/esmi-logo.svg          colour lockup (mark + ESMI)
#   assets/film-v3/esmi-logo-light.svg    light lockup for the film's end card (animated by film-ad)
#   favicon.ico + assets/film-v3/esmi-favicon.svg (bold tile for browser tabs)
#   apple-touch-icon.png, assets/icon-192.png, assets/icon-512.png
# The lockups keep their existing ESMI letters; only the mark group is replaced.
# Usage: python scripts/build-logo-assets.py <traced-mark.svg>
import os, re, sys
import cv2
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FILM = os.path.join(ROOT, 'assets', 'film-v3')
mark_svg = open(sys.argv[1], encoding='utf-8').read()

view = [float(v) for v in re.search(r'viewBox="([^"]+)"', mark_svg).group(1).split()]
pieces = re.findall(r'<path data-piece="([^"]+)" fill="(#[0-9a-f]{6})" d="([^"]+)"/>', mark_svg)
def polygons(d):
    return [np.array([float(v) for v in part.split()]).reshape(-1, 2) for part in re.findall(r'M([^Z]+)Z', d)]

# 1. Header mark: the traced SVG as is.
open(os.path.join(FILM, 'esmi-mark.svg'), 'w', encoding='utf-8', newline='\n').write(mark_svg)

# 2. Lockups: the mark sits left of the letters (cap height 26-121), centred on them.
def lockup(name, colours):
    path = os.path.join(FILM, name)
    s = open(path, encoding='utf-8').read()
    a, b = s.index('<g class="esmi-logo-mark"'), s.index('<g class="esmi-logo-word"')
    x0, y0, w, h = view
    height = 104; k = height / h; width = w * k
    left, top = 168 - width, 73.5 - height / 2
    waves = {'boat': 'top', 'sun-and-wave': 'middle'}
    paths = ''.join(f'<path data-piece="{p}" data-wave="{waves.get(p, "top")}" fill="{colours.get(p, c)}" fill-rule="evenodd" d="{d}"/>' for p, c, d in pieces)
    group = f'<g class="esmi-logo-mark" transform="translate({left:.2f} {top:.2f}) scale({k:.5f}) translate({-x0:.2f} {-y0:.2f})">{paths}</g>\n  '
    s = s[:a] + group + s[b:]
    vx = min(0, round(left - 8))                     # widen the canvas leftwards to fit the mark
    s = re.sub(r'viewBox="[^"]+"', f'viewBox="{vx} 0 {487 - vx} 147"', s, count=1)
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
lockup('esmi-logo.svg', {})
lockup('esmi-logo-light.svg', {'boat': '#ffffff', 'sun-and-wave': '#3cc6c2'})

# 3. Icons, drawn from the outlines at 4x and scaled down for smooth edges.
def render(size, pad, background=None):
    big = size * 4
    canvas = np.zeros((big, big, 4), np.uint8)
    if background: canvas[:] = (*background, 255)
    x0, y0, w, h = view
    k = big * (1 - 2 * pad) / max(w, h)
    ox, oy = (big - w * k) / 2, (big - h * k) / 2
    for _, colour, d in pieces:
        rgb = tuple(int(colour[i:i + 2], 16) for i in (1, 3, 5))
        polys = [np.round((p - (x0, y0)) * k + (ox, oy)).astype(np.int32) for p in polygons(d)]
        mask = np.zeros((big, big), np.uint8)
        for poly in polys:                                  # even-odd: inner outlines cut holes
            single = np.zeros_like(mask); cv2.fillPoly(single, [poly], 255, cv2.LINE_AA)
            mask = cv2.bitwise_xor(mask, single)
        # Porter-Duff "over" with straight alpha, so smoothed edges keep their colour.
        a = mask.astype(float)[..., None] / 255
        base_a = canvas[..., 3:].astype(float) / 255
        out_a = a + base_a * (1 - a)
        out_rgb = (np.array(rgb) * a + canvas[..., :3] * base_a * (1 - a)) / np.maximum(out_a, 1e-6)
        canvas[..., :3] = np.clip(out_rgb, 0, 255).astype(np.uint8)
        canvas[..., 3] = np.clip(out_a[..., 0] * 255, 0, 255).astype(np.uint8)
    return Image.fromarray(canvas, 'RGBA').resize((size, size), Image.LANCZOS)

render(512, .06).save(os.path.join(ROOT, 'assets', 'icon-512.png'))
render(192, .06).save(os.path.join(ROOT, 'assets', 'icon-192.png'))
render(180, .1, (255, 255, 255)).convert('RGB').save(os.path.join(ROOT, 'apple-touch-icon.png'))
# 4. Favicon: the wide mark is tiny in a square tab icon, so the favicon is a bold tile: a
#    dark-teal rounded square with the mark in light colours across most of its width, and
#    the thin lines thickened by a fraction of a pixel at the smallest sizes.
TILE, LIGHT = (5, 68, 78), {'boat': '#ffffff', 'sun-and-wave': '#3cc6c2'}
def tile(size, grow):
    big = size * 8
    canvas = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    plate = np.zeros((big, big), np.uint8)
    r = round(big * .22)
    cv2.rectangle(plate, (r, 0), (big - r, big), 255, -1); cv2.rectangle(plate, (0, r), (big, big - r), 255, -1)
    for cx, cy in ((r, r), (big - r - 1, r), (r, big - r - 1), (big - r - 1, big - r - 1)):
        cv2.circle(plate, (cx, cy), r, 255, -1, cv2.LINE_AA)
    out = np.zeros((big, big, 4), float)
    out[..., :3] = TILE; out[..., 3] = plate / 255
    x0, y0, w, h = view
    k = big * .86 / w
    ox, oy = (big - w * k) / 2, (big - h * k) / 2 + big * .02
    grow_px = int(round(grow * 8))
    for piece, _, d in pieces:
        rgb = np.array([int(LIGHT[piece][i:i + 2], 16) for i in (1, 3, 5)], float)
        mask = np.zeros((big, big), np.uint8)
        for poly in polygons(d):
            single = np.zeros_like(mask)
            cv2.fillPoly(single, [np.round((poly - (x0, y0)) * k + (ox, oy)).astype(np.int32)], 255, cv2.LINE_AA)
            mask = cv2.bitwise_xor(mask, single)
        if grow_px: mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * grow_px + 1,) * 2))
        a = (mask / 255.0) * (plate / 255.0)
        out[..., :3] = out[..., :3] * (1 - a[..., None]) + rgb * a[..., None]
    canvas = Image.fromarray(np.clip(np.dstack([out[..., :3], out[..., 3:] * 255]), 0, 255).astype(np.uint8), 'RGBA')
    return canvas.resize((size, size), Image.LANCZOS)

frames = {16: tile(16, .6), 32: tile(32, .4), 48: tile(48, .25)}
frames[48].save(os.path.join(ROOT, 'favicon.ico'), sizes=[(16, 16), (32, 32), (48, 48)], append_images=[frames[16], frames[32]])

# The same tile as an SVG tab icon (modern browsers prefer it and scale it sharply).
x0, y0, w, h = view
k = 512 * .86 / w
ox, oy = (512 - w * k) / 2, (512 - h * k) / 2 + 512 * .02
paths = ''.join(f'<path fill="{LIGHT[p]}" stroke="{LIGHT[p]}" stroke-width="5" stroke-linejoin="round" fill-rule="evenodd" d="{d}"/>' for p, _, d in pieces)
open(os.path.join(FILM, 'esmi-favicon.svg'), 'w', encoding='utf-8', newline='\n').write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>ESMI</title>'
    f'<rect width="512" height="512" rx="113" fill="#05444e"/>'
    f'<g transform="translate({ox:.2f} {oy:.2f}) scale({k:.5f}) translate({-x0:.2f} {-y0:.2f})">{paths}</g></svg>\n')
print('logo assets written')
