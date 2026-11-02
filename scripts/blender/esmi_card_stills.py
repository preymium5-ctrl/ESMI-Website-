# ESMI E-Boat highlight cards: close-up stills of the scene "ESMI Boat" (built by esmi_boat.py).
# Run inside Blender after building the scene. render_cards() writes 1600x1000 WebP files to
# assets/eboats/ (film.webp is a film poster and is not rendered here).
import bpy, math, os
from mathutils import Vector

ROOT = r"D:\ESMI WEB"
F = lambda a: 1 + round(max(0, min(1, a)) * 240)
LATER = ('deck-', 'rail-', 'upright-', 'roof-', 'canopy-', 'seat-', 'console', 'steering-wheel', 'helm-column', 'windscreen', 'solar-module')
SHOTS = {
    'hulls':   dict(frame=241, focus=['starboard-bow-upper', 'starboard-bow-lower', 'starboard-upper-1', 'starboard-lower-1'], az=-28, el=5, pad=.7, off=(0, 0, .55)),
    'drive':   dict(frame=F(.115), focus=['drive-motor', 'drive-mount', 'drive-shaft', 'propeller'], az=-155, el=12, pad=.6,
                    hide=LATER + ('battery', 'bms', 'busbar', 'cable', 'motor-controller', 'distribution-box', 'solar-charger')),
    'battery': dict(frame=F(.225), focus=['battery-module-%d' % i for i in range(8)] + ['battery-tray', 'bms'], az=-62, el=34, pad=.78, hide=LATER),
    'wiring':  dict(frame=F(.33), focus=['cable-%d' % i for i in range(9)] + ['motor-controller', 'distribution-box', 'busbar-0', 'busbar-1', 'busbar-2'], az=-58, el=38, pad=.72, hide=LATER),
    'seating': dict(frame=F(.825), focus=['seat-%d' % i for i in range(4)], az=-70, el=24, pad=1.2),
    'helm':    dict(frame=241, focus=['console', 'steering-wheel', 'helm-column', 'windscreen'], az=-32, el=16, pad=1.25),
    'solar':   dict(frame=241, focus=['solar-module-%d' % i for i in range(12)], az=-52, el=30, pad=.78),
}

def _rig(sc):
    cam = bpy.data.objects.get('esmi stills cam')
    if not cam or cam.name not in sc.objects:
        cam = bpy.data.objects.new('esmi stills cam', bpy.data.cameras.new('esmi stills cam')); sc.collection.objects.link(cam)
    tg = bpy.data.objects.get('esmi stills target')
    if not tg or tg.name not in sc.objects:
        tg = bpy.data.objects.new('esmi stills target', None); sc.collection.objects.link(tg)
    if not cam.constraints:
        c = cam.constraints.new('TRACK_TO'); c.track_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
    cam.constraints[0].target = tg
    return cam, tg

def _points(sc, ids):
    dg = bpy.context.evaluated_depsgraph_get(); P = []
    for pid in ids:
        em = sc.objects.get('esmi part ' + pid)
        if not em: continue
        for ob in [em] + list(em.children_recursive):
            if ob.type in ('MESH', 'CURVE', 'FONT'):
                ev = ob.evaluated_get(dg)
                try: me = ev.to_mesh()
                except Exception: continue
                vs = list(me.vertices)
                P += [ev.matrix_world @ v.co for v in vs[::max(1, len(vs) // 200)]]
                ev.to_mesh_clear()
    return P

def place(sc, cam, tg, s, lens=50):
    sc.frame_set(s['frame']); P = _points(sc, s['focus'])
    lo = Vector([min(p[i] for p in P) for i in range(3)]); hi = Vector([max(p[i] for p in P) for i in range(3)])
    c, r = (lo + hi) / 2, (hi - lo).length / 2
    cam.data.lens = lens; cam.data.sensor_width = 36
    dist = r * s['pad'] / (18 / lens * 1000 / 1600)
    az, el = math.radians(s['az']), math.radians(s['el'])
    tg.location = c + Vector(s.get('off', (0, 0, 0)))
    cam.location = c + Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el))) * dist

def render_cards(names=None, pct=100, samples=40, out=None, fmt='WEBP'):
    sc = bpy.data.scenes['ESMI Boat']; cam, tg = _rig(sc)
    out = out or os.path.join(ROOT, 'assets', 'eboats'); os.makedirs(out, exist_ok=True)
    r = sc.render; keep = (sc.camera, r.filepath, r.resolution_x, r.resolution_y, r.resolution_percentage, sc.cycles.samples, r.image_settings.file_format, sc.frame_current)
    sc.camera = cam; r.resolution_x, r.resolution_y, r.resolution_percentage = 1600, 1000, pct; sc.cycles.samples = samples
    r.image_settings.file_format = fmt; r.image_settings.quality = 88
    try:
        for n in names or list(SHOTS):
            s = SHOTS[n]; hidden = []
            for em in sc.objects:
                if any(em.name.startswith('esmi part ' + pre) for pre in s.get('hide', ())):
                    for ob in [em] + list(em.children_recursive):
                        if not ob.hide_render: ob.hide_render = True; hidden.append(ob)
            try:
                place(sc, cam, tg, s)
                r.filepath = os.path.join(out, n + ('.png' if fmt == 'PNG' else '.webp'))
                bpy.ops.render.render(write_still=True, scene=sc.name)
            finally:
                for ob in hidden: ob.hide_render = False
    finally:
        sc.camera, r.filepath, r.resolution_x, r.resolution_y, r.resolution_percentage, sc.cycles.samples, r.image_settings.file_format, f = keep
        sc.frame_set(f)
