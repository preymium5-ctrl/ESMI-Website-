# Export the ESMI E-Boat for the Inspect page (assets/inspect/esmi-eboat.glb).
# Rebuilds the "ESMI Boat" scene from esmi_boat.py, then exports only the boat
# (no studio, lights or camera) with its exploded-to-assembled animation.
# Run headless from the project folder:
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b --factory-startup --python scripts\blender\export_inspect_glb.py
import bpy, os

ROOT = r'D:\ESMI WEB'
OUT = os.path.join(ROOT, 'assets', 'inspect', 'esmi-eboat.glb')

# Drop the factory-startup cube and its material so they are not exported.
for ob in list(bpy.data.objects): bpy.data.objects.remove(ob, do_unlink=True)
for ma in list(bpy.data.materials): bpy.data.materials.remove(ma)
exec(open(os.path.join(ROOT, 'scripts', 'blender', 'esmi_boat.py'), encoding='utf-8').read())

sc = bpy.data.scenes['ESMI Boat']
bpy.context.window.scene = sc

# The render's solar material draws its cells with a procedural Brick texture, which glTF
# cannot carry (it exports as plain white). Give the web model the same look as an image:
# 10 x 6 navy cells per module with light bus lines, mapped top-down onto each module.
import numpy as np
CELLS_X, CELLS_Y, PX = 10, 6, 96
w, h = CELLS_X * PX, CELLS_Y * PX
def lin(hexcolor):
    return np.array(srgb(hexcolor) + (1.0,), dtype=np.float32)
pix = np.empty((h, w, 4), dtype=np.float32)
rng = np.random.default_rng(7)
for cy in range(CELLS_Y):
    for cx in range(CELLS_X):
        tint = lin('#172c74') * (0.92 + 0.12 * rng.random())       # slight cell-to-cell variation
        tint[3] = 1.0
        pix[cy * PX:(cy + 1) * PX, cx * PX:(cx + 1) * PX] = tint
line = max(2, round(PX * .045))
for k in range(CELLS_X + 1):                                         # cell gaps
    x = min(w - line, k * PX - line // 2) if k else 0
    pix[:, max(0, x):x + line] = lin('#7d89ad')
for k in range(CELLS_Y + 1):
    y = min(h - line, k * PX - line // 2) if k else 0
    pix[max(0, y):y + line, :] = lin('#7d89ad')
for cx in range(CELLS_X):                                            # two thin busbars per cell
    for f in (1 / 3, 2 / 3):
        x = cx * PX + round(PX * f)
        pix[:, x:x + 1] = lin('#3c4a78')
img = bpy.data.images.new('esmi solar cells', w, h, alpha=False)
img.pixels.foreach_set(pix.ravel())
img.pack()
web_solar, b, nt = principled('solar cells web', '#ffffff', rough=.3, coat=.4, coat_rough=.04, specular=.45)
tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.location = (-400, 0)
nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
for ob in sc.objects:
    if ob.type != 'MESH' or not ob.name.startswith('esmi solar module'): continue
    me = ob.data
    xs = [v.co.x for v in me.vertices]; ys = [v.co.y for v in me.vertices]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    uv = me.uv_layers.new(name='UVMap')
    for loop in me.loops:
        co = me.vertices[loop.vertex_index].co
        uv.data[loop.index].uv = ((co.x - x0) / (x1 - x0), (co.y - y0) / (y1 - y0))
    me.materials[0] = web_solar
SKIP = {'esmi studio', 'esmi light target', 'esmi camera target'}
keep = [ob for ob in sc.objects if ob.type not in {'LIGHT', 'CAMERA'} and ob.name not in SKIP]
for ob in sc.objects: ob.select_set(ob in keep)
sc.frame_set(1)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=OUT, export_format='GLB', use_selection=True,
    export_apply=True, export_animations=True,
    export_animation_mode='ACTIVE_ACTIONS', export_frame_range=False,
    export_cameras=False, export_lights=False, export_yup=True)
print('Exported', len(keep), 'objects to', OUT, round(os.path.getsize(OUT) / 1e6, 2), 'MB')
