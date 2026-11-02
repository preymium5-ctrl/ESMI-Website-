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
