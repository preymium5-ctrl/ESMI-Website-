# Builds the low-resolution preview frames used while the Engineering assembly loads.
# Every frame in the active manifest (assets/v3/assembly.json) is shrunk to a 640x360 WebP and
# all of them are packed back to back into one file, assets/v3/frames-preview.bin, so a first
# visit gets every preview in a single request. The manifest's "previewPack" lists the file
# and the byte offset where each frame starts (plus the end of the last one).
# Run from the project folder after re-rendering the frames:  python scripts/build-frame-previews.py
import io, json, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'assets', 'v3', 'assembly.json')
PACK = os.path.join(ROOT, 'assets', 'v3', 'frames-preview.bin')

manifest = json.load(open(MANIFEST, encoding='utf-8'))
offsets, data = [0], bytearray()
for path in manifest['frames']:
    buffer = io.BytesIO()
    Image.open(os.path.normpath(os.path.join(ROOT, path))).convert('RGB').resize((640, 360), Image.LANCZOS).save(buffer, 'WEBP', quality=60, method=6)
    data += buffer.getvalue()
    offsets.append(len(data))
with open(PACK, 'wb') as f:
    f.write(data)
manifest.pop('previews', None)
manifest['previewPack'] = {'src': './assets/v3/frames-preview.bin', 'type': 'image/webp', 'width': 640, 'height': 360, 'offsets': offsets}
with open(MANIFEST, 'w', encoding='utf-8', newline='\n') as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
    f.write('\n')
print(f'{len(offsets) - 1} previews packed, {len(data) / 1e6:.2f} MB')
