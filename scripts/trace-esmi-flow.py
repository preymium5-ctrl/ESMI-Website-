"""Trace the approved Google Flow artwork into persisted, editable SVG geometry.

This is deterministic contour export, not image generation or a logo redesign.
Requires the locally available OpenCV, NumPy, fontTools and Pillow packages.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "reference" / "branding" / "esmi-wave-google-flow-original.jpg"
OUTPUT = ROOT / "assets" / "film-v3" / "esmi-mark-geometry.json"


def n(value):
    return f"{float(value):.3f}".rstrip("0").rstrip(".")


def point(value):
    return " ".join(n(x) for x in value)


def outline_path(contour, origin):
    # Subpixel visual error at website sizes, while retaining the pointed tips.
    vertices = cv2.approxPolyDP(contour, 1.0, True)[:, 0, :].astype(float)
    vertices -= origin
    corners = []
    for i, p in enumerate(vertices):
        incoming = p - vertices[(i-1) % len(vertices)]
        outgoing = vertices[(i+1) % len(vertices)] - p
        cosine = np.dot(incoming, outgoing) / (np.linalg.norm(incoming) * np.linalg.norm(outgoing))
        corners.append(cosine < math.cos(math.radians(45)))
    start = vertices[-1] if corners[-1] else (vertices[-1] + vertices[0])/2
    commands = ["M" + point(start)]
    for i, p in enumerate(vertices):
        if corners[i]:
            commands.append("L" + point(p))
        else:
            midpoint = (p + vertices[(i+1) % len(vertices)])/2
            commands.append("Q" + point(p) + " " + point(midpoint))
    commands.append("Z")
    return "".join(commands), len(vertices)


def main():
    image = cv2.imread(str(SOURCE))
    if image is None:
        raise FileNotFoundError(SOURCE)
    hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
    foreground = ((hsv[:, :, 1] > 75) & (hsv[:, :, 2] < 245)).astype(np.uint8)*255
    count, labels, stats, centroids = cv2.connectedComponentsWithStats(foreground)
    components = [i for i in range(1, count) if stats[i, cv2.CC_STAT_AREA] > 100]
    if len(components) != 5:
        raise ValueError(f"Expected the approved artwork's 5 pieces, found {len(components)}")
    components.sort(key=lambda i: stats[i, cv2.CC_STAT_TOP])
    left = min(int(stats[i, cv2.CC_STAT_LEFT]) for i in components)
    top = min(int(stats[i, cv2.CC_STAT_TOP]) for i in components)
    right = max(int(stats[i, cv2.CC_STAT_LEFT]+stats[i, cv2.CC_STAT_WIDTH]) for i in components)
    bottom = max(int(stats[i, cv2.CC_STAT_TOP]+stats[i, cv2.CC_STAT_HEIGHT]) for i in components)
    identity = [
        ("top-crest", "top"),
        ("teal-teardrop", "top"),
        ("middle-ribbon", "middle"),
        ("lower-left-ribbon", "bottom"),
        ("lower-right-crest", "bottom"),
    ]
    pieces = []
    for component, (name, wave) in zip(components, identity):
        mask = (labels == component).astype(np.uint8)*255
        contour = max(cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)[0], key=cv2.contourArea)
        interior = cv2.erode(mask, np.ones((5, 5), np.uint8)) > 0
        color = np.median(image[interior][:, ::-1], axis=0).astype(int)
        d, anchors = outline_path(contour, np.array([left, top]))
        pieces.append({
            "id": name,
            "wave": wave,
            "fill": "#" + "".join(f"{c:02x}" for c in color),
            "d": d,
            "sourceAreaPixels": int(stats[component, cv2.CC_STAT_AREA]),
            "traceAnchors": anchors,
        })
    geometry = {
        "source": {
            "creator": "Google Flow",
            "image": SOURCE.relative_to(ROOT).as_posix(),
            "reference": "reference/branding/esmi-wave-reference.png",
            "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "imageSize": [image.shape[1], image.shape[0]],
            "assetId": "72b96800-70c2-4500-82fe-2fa682a17241",
            "projectUrl": "https://flow.google.com/project/baaf1cc5-dd14-41a1-899d-e23a1eb31a35/edit/cd96820a-9046-4725-8a40-cdca0148d530",
        },
        "export": {
            "method": "Saturation-mask contour trace with corner-preserving quadratic interpolation",
            "contourToleranceSourcePixels": 1.0,
            "colorMethod": "Median RGB of each source piece, eroded 2px to exclude JPEG edge blending",
            "sourceBounds": [left, top, right-left, bottom-top],
            "pieceCount": len(pieces),
        },
        "viewBox": [0, 0, right-left, bottom-top],
        "pieces": pieces,
        "rebuildGeometry": "python scripts/trace-esmi-flow.py",
    }
    OUTPUT.write_text(json.dumps(geometry, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"path": str(OUTPUT), "viewBox": geometry["viewBox"], "pieces": [{k: p[k] for k in ("id", "wave", "fill", "traceAnchors")} for p in pieces]}, indent=2))


if __name__ == "__main__":
    main()
