# Render one studio card per boat part for the "Explore the E-Boat" cards
# (assets/eboats/parts/<id>.webp, 1600x1000). Builds the "ESMI Boat" scene from esmi_boat.py,
# assembles it, then for each part group hides every other part and frames the camera on the
# group from a three-quarter bow angle. The groups match the Inspect inventory.
# Run headless from the project folder:
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python scripts\blender\render_part_cards.py
import bpy, math, os, re, sys
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view

ROOT = r'D:\ESMI WEB'
OUT = os.path.join(ROOT, 'assets', 'eboats', 'parts')
GROUPS = [
    ('hulls', r'^(port|starboard)-'), ('crossbeams', r'^crossbeam'), ('deck', r'^deck-'),
    ('railings', r'^rail-'), ('seats', r'^seat'), ('helm', r'^(console|helm-column|steering-wheel|windscreen)$'),
    ('canopy', r'^(upright|roof-|canopy-edge)'), ('solar', r'^solar-module'), ('drive', r'^(drive-|propeller)'),
    ('batteries', r'^(battery-|bms|busbar|distribution-box)'), ('wiring', r'^(cable|motor-controller|solar-charger)'),
]
ONLY = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []

for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
exec(open(os.path.join(ROOT, 'scripts', 'blender', 'esmi_boat.py'), encoding='utf-8').read())

sc = bpy.data.scenes['ESMI Boat']
bpy.context.window.scene = sc
sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
sc.render.image_settings.file_format = 'WEBP'
sc.render.image_settings.quality = 86
sc.frame_set(FRAMES)                                  # fully assembled

cam = sc.camera
target = cam.constraints[0].target
for ob in (cam, target):
    ob.animation_data_clear()

def objects_of(p):
    out = []
    for ob in p['objs']:
        out.append(ob)
        out.extend(ob.children_recursive)
    return out

boat = [ob for p in PARTS for ob in objects_of(p)]
studio, FLOOR_Z = bpy.data.objects['esmi studio'], -1.07
os.makedirs(OUT, exist_ok=True)
view = Vector((1.0, -1.15, 0.72)).normalized()
for gid, pattern in GROUPS:
    if ONLY and gid not in ONLY: continue
    members = [ob for p in PARTS if re.search(pattern, p['id']) for ob in objects_of(p)]
    keep = set(members)
    for ob in boat: ob.hide_render = ob not in keep
    bpy.context.view_layer.update()
    pts = [ob.matrix_world @ Vector(c) for ob in members if ob.type in {'MESH', 'CURVE', 'FONT'} for c in ob.bound_box]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) / 2
    studio.location.z = lo.z - FLOOR_Z                # the studio floor meets the part's base
    corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    distance = (hi - lo).length * 1.6
    target.location = center
    for _ in range(4):
        cam.location = center + view * distance
        bpy.context.view_layer.update()
        proj = [world_to_camera_view(sc, cam, c) for c in corners]
        spread = max(max(abs(p.x - .5) for p in proj), max(abs(p.y - .5) for p in proj)) * 2
        distance *= spread / .78
    cam.location = center + view * distance
    sc.render.filepath = os.path.join(OUT, gid + '.webp')
    bpy.ops.render.render(write_still=True)
    print('CARD', gid, round(distance, 2), 'm')
for ob in boat: ob.hide_render = False
studio.location.z = 0
