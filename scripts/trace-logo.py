# Traces the ESMI boat logo (a raster on white) into a clean two-colour SVG mark.
# Each pixel is split into how much of the dark boat colour and the teal colour it holds
# (they are blended with white at the edges), the two coverage maps are smoothed and
# upsampled, and their outlines become SVG paths, so the mark stays sharp at any size.
# Usage: python scripts/trace-logo.py <logo.png> <out.svg>
import sys
import cv2
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
DARK, TEAL = np.array([5, 68, 78], float), np.array([29, 164, 163], float)
SCALE = 6

rgba = np.array(Image.open(SRC).convert('RGBA')).astype(float)
rgb = rgba[..., :3] * (rgba[..., 3:] / 255) + 255 * (1 - rgba[..., 3:] / 255)
ink = 255 - rgb                                       # how far each pixel is from white
basis = np.stack([255 - DARK, 255 - TEAL], 1)         # 3x2: each colour's distance from white
cover, *_ = np.linalg.lstsq(basis, ink.reshape(-1, 3).T, rcond=None)
cover = np.clip(cover.T.reshape(*ink.shape[:2], 2), 0, 1)

def outlines(layer):
    smooth = cv2.GaussianBlur(layer.astype(np.float32), (0, 0), .7)
    big = cv2.resize(smooth, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    mask = (big > .5).astype(np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    paths, area = [], 0
    for c in contours:
        if cv2.contourArea(c) < 40 * SCALE * SCALE: continue      # specks of JPEG noise
        area += cv2.contourArea(c)
        pts = cv2.approxPolyDP(c, .9, True)[:, 0] / SCALE
        paths.append('M' + ' '.join(f'{x:.2f} {y:.2f}' for x, y in pts) + 'Z')
    return paths, mask

dark_paths, dark_mask = outlines(cover[..., 0])
teal_paths, teal_mask = outlines(cover[..., 1])
ys, xs = np.nonzero(dark_mask | teal_mask)
pad = 4
x0, y0 = xs.min() / SCALE - pad, ys.min() / SCALE - pad
w, h = (xs.max() - xs.min()) / SCALE + 2 * pad, (ys.max() - ys.min()) / SCALE + 2 * pad
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" role="img" aria-labelledby="esmi-mark-title">
  <title id="esmi-mark-title">ESMI boat mark</title>
  <g class="esmi-logo-mark" fill-rule="evenodd">
    <path data-piece="sun-and-wave" fill="#1da4a3" d="{' '.join(teal_paths)}"/>
    <path data-piece="boat" fill="#05444e" d="{' '.join(dark_paths)}"/>
  </g>
</svg>
'''
open(OUT, 'w', encoding='utf-8', newline='\n').write(svg)
print(f'{len(dark_paths)} boat shapes, {len(teal_paths)} teal shapes, viewBox {w:.0f}x{h:.0f}, {len(svg) / 1024:.1f} KB')
