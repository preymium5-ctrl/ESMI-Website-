# ESMI E-Boat — exploded assembly scene for Blender 5.x
# Built from reference/esmi-product.jpeg. Run inside Blender:
#   exec(open(r"D:\ESMI WEB\scripts\blender\esmi_boat.py").read())
# Creates (or rebuilds) the scene "ESMI Boat": ~120 parts keyframed from exploded
# (frame 1) to assembled (frame 241), studio set, lights and an animated camera.
# Bow is +X, port (camera side) is +Y, hull tops at Z = 0. Units are metres.
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

ROOT = r'D:\ESMI WEB'
SCENE = 'ESMI Boat'
FRAMES = 241
TAU = math.tau
BACK = 1.25

def F(a):
    return 1 + round(max(0.0, min(1.0, a)) * (FRAMES - 1))

def clamp(v, a=0.0, b=1.0):
    return max(a, min(b, v))

def smooth(t):
    t = clamp(t); return t * t * (3 - 2 * t)

def ease_in_out(t):
    t = clamp(t); return 4 * t ** 3 if t < .5 else 1 - (-2 * t + 2) ** 3 / 2

def lerp(a, b, t):
    return a + (b - a) * t

def srgb(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= .04045 else ((x + .055) / 1.055) ** 2.4 for x in c)

# ---------------------------------------------------------------- scene -----
def new_scene():
    sc = bpy.data.scenes.get(SCENE) or bpy.data.scenes.new(SCENE)
    for ob in list(sc.collection.all_objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights, bpy.data.actions):
        for d in list(coll):
            if d.name.startswith('esmi') and d.users == 0:
                coll.remove(d)
    for win in bpy.context.window_manager.windows:
        win.scene = sc
    sc.frame_start, sc.frame_end, sc.frame_current = 1, FRAMES + 23, 1
    sc.render.fps = 24
    return sc

# ------------------------------------------------------------ materials -----
def principled(name, hexcolor, metallic=0.0, rough=0.5, coat=0.0, coat_rough=0.05, alpha=1.0, transmission=0.0, specular=None):
    key = 'esmi ' + name
    m = bpy.data.materials.get(key) or bpy.data.materials.new(key)
    m.use_nodes = True
    nt = m.node_tree
    for n in list(nt.nodes):
        nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); out.location = (300, 0)
    b = nt.nodes.new('ShaderNodeBsdfPrincipled'); b.location = (0, 0)
    nt.links.new(b.outputs[0], out.inputs[0])
    col = srgb(hexcolor)
    def s(n, v):
        if n in b.inputs: b.inputs[n].default_value = v
    s('Base Color', (*col, 1)); s('Metallic', metallic); s('Roughness', rough)
    s('Coat Weight', coat); s('Coat Roughness', coat_rough); s('Alpha', alpha); s('Transmission Weight', transmission)
    if specular is not None: s('Specular IOR Level', specular)
    m.diffuse_color = (*col, alpha)
    m.metallic, m.roughness = metallic, rough
    return m, b, nt

def build_materials():
    M = {}
    M['hull'] = principled('hull silver', '#c3c7cc', metallic=.35, rough=.38, coat=.1, specular=.4)[0]
    M['hullLow'] = principled('hull charcoal', '#2b2e32', metallic=.05, rough=.55, specular=.3)[0]
    M['trim'] = principled('trim black', '#26292d', rough=.45)[0]
    M['vent'] = principled('vent', '#1c1e21', rough=.6)[0]
    M['alu'] = principled('brushed aluminium', '#b9bec4', metallic=1, rough=.3)[0]
    M['beam'] = principled('beam', '#a9aeb4', metallic=.9, rough=.35)[0]
    M['plate'] = principled('base plate', '#2c2f33', metallic=.3, rough=.4)[0]
    M['knuckle'] = principled('knuckle', '#33363a', metallic=.4, rough=.35)[0]
    M['seatShell'] = principled('seat shell', '#1f2124', rough=.48)[0]
    M['seatPad'] = principled('seat cushion', '#b9bcc0', rough=.88)[0]
    M['seatBase'] = principled('seat base', '#45484d', rough=.55)[0]
    M['console'] = principled('console gelcoat', '#f3f4f5', rough=.22, coat=.5)[0]
    M['glass'] = principled('tinted screen', '#22262b', rough=.05, transmission=.55, alpha=.9, coat=.6)[0]
    M['wheel'] = principled('wheel', '#1b1d20', rough=.35)[0]
    M['solarEdge'] = principled('solar frame', '#cdd1d6', metallic=1, rough=.25)[0]
    M['battery'] = principled('battery', '#dadde0', rough=.4)[0]
    M['batteryTop'] = principled('battery top', '#8f9ca8', rough=.5)[0]
    M['tray'] = principled('tray', '#4a4f55', metallic=.5, rough=.45)[0]
    M['controller'] = principled('controller', '#4f555c', metallic=.6, rough=.35)[0]
    M['fins'] = principled('fins', '#8a9097', metallic=1, rough=.3)[0]
    M['motor'] = principled('outboard', '#1d1f22', rough=.3, coat=.6)[0]
    M['motorMid'] = principled('outboard grey', '#3a3d42', rough=.4)[0]
    M['prop'] = principled('propeller', '#2f3338', metallic=.8, rough=.3)[0]
    M['copper'] = principled('copper', '#c27c43', metallic=1, rough=.3)[0]
    M['red'] = principled('red', '#c43c32', rough=.4)[0]
    M['black'] = principled('black', '#26282b', rough=.45)[0]
    M['orange'] = principled('orange cable', '#e07a2c', rough=.45)[0]
    M['blue'] = principled('blue cable', '#2f7fb3', rough=.45)[0]
    M['green'] = principled('bms', '#5f8f6a', rough=.45)[0]
    M['charger'] = principled('charger', '#3e5f7a', rough=.4)[0]
    M['screen'] = principled('display', '#2a6f8f', rough=.15, coat=1)[0]
    M['text'] = principled('esmi navy', '#1d4a5b', rough=.4)[0]
    m, b, nt = principled('studio cyc', '#d4d4d2', rough=.95, specular=.2)
    if 'Emission Color' in b.inputs:
        b.inputs['Emission Color'].default_value = (*srgb('#f4f4f2'), 1); b.inputs['Emission Strength'].default_value = .55
    M['studio'] = m
    # Non-slip deck: fine noise bump.
    m, b, nt = principled('deck', '#5d6166', rough=.9, specular=.3)
    noise = nt.nodes.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 900; noise.location = (-500, -200)
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = .15; bump.location = (-250, -200)
    nt.links.new(noise.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    M['deck'] = m
    # Solar modules: dark cells separated by silver bus lines, under glossy glass.
    m, b, nt = principled('solar cells', '#101b45', rough=.62, specular=.06)
    tc = nt.nodes.new('ShaderNodeTexCoord'); tc.location = (-900, 0)
    mp = nt.nodes.new('ShaderNodeMapping'); mp.location = (-700, 0); mp.inputs['Scale'].default_value = (10, 6, 1)
    br = nt.nodes.new('ShaderNodeTexBrick'); br.location = (-450, 0)
    br.offset, br.squash = 0.0, 1.0
    br.inputs['Color1'].default_value = (*srgb('#122056'), 1); br.inputs['Color2'].default_value = (*srgb('#0f1b4b'), 1)
    br.inputs['Mortar'].default_value = (*srgb('#4a5888'), 1); br.inputs['Scale'].default_value = 1
    br.inputs['Mortar Size'].default_value = .035; br.inputs['Brick Width'].default_value = 1; br.inputs['Row Height'].default_value = 1
    nt.links.new(tc.outputs['Generated'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], br.inputs['Vector'])
    nt.links.new(br.outputs['Color'], b.inputs['Base Color'])
    M['solar'] = m
    return M

def image_material(name, path):
    m, b, nt = principled(name, '#ffffff', rough=.4)
    img = bpy.data.images.load(path, check_existing=True)
    tex = nt.nodes.new('ShaderNodeTexImage'); tex.image = img; tex.location = (-400, 0); tex.extension = 'CLIP'
    nt.links.new(tex.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(tex.outputs['Alpha'], b.inputs['Alpha'])
    return m

# -------------------------------------------------------------- geometry ----
def vadd(a, b): return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
def vsub(a, b): return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
def vmul(a, s): return [a[0] * s, a[1] * s, a[2] * s]
def vnorm(a):
    l = math.sqrt(sum(x * x for x in a)) or 1
    return [x / l for x in a]
def vcross(a, b): return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]

BOX_FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]]
def hexa(v): return {'verts': v, 'faces': BOX_FACES}
def box(cx, cy, cz, sx, sy, sz):
    x0, x1, y0, y1, z0, z1 = cx - sx / 2, cx + sx / 2, cy - sy / 2, cy + sy / 2, cz - sz / 2, cz + sz / 2
    return hexa([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])
def loft(rings, caps=True):
    n = len(rings[0]); verts = [p for r in rings for p in r]; faces = []
    for k in range(len(rings) - 1):
        for i in range(n):
            j = (i + 1) % n
            faces.append([k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i])
    if caps:
        faces.append(list(range(n))); faces.append([(len(rings) - 1) * n + i for i in range(n)])
    return {'verts': verts, 'faces': faces}
def basis(axis):
    a = vnorm(axis)
    helper = [0, 0, 1] if abs(a[2]) < .9 else [1, 0, 0]
    u = vnorm(vcross(a, helper)); v = vcross(a, u)
    return u, v
def tube(p0, p1, r, sides=18):
    u, v = basis(vsub(p1, p0))
    ring = lambda c: [vadd(c, vadd(vmul(u, math.cos(i / sides * TAU) * r), vmul(v, math.sin(i / sides * TAU) * r))) for i in range(sides)]
    s = loft([ring(p0), ring(p1)]); s['smooth_sides'] = sides
    return s
def sq(p0, p1, w, d=None):
    d = d or w
    u, v = basis(vsub(p1, p0))
    ring = lambda c: [vadd(c, vadd(vmul(u, a * w / 2), vmul(v, b * d / 2))) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    return loft([ring(p0), ring(p1)])

COL = None
def make_mesh(name, solid, material, bevel=0.0):
    me = bpy.data.meshes.new('esmi ' + name)
    me.from_pydata([tuple(p) for p in solid['verts']], [], [tuple(f) for f in solid['faces']])
    me.validate()
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    me.materials.append(material)
    ob = bpy.data.objects.new('esmi ' + name, me)
    COL.objects.link(ob)
    sides = solid.get('smooth_sides')
    if sides:
        flags = [True] * len(me.polygons)
        for p in me.polygons:
            if len(p.vertices) > 4: flags[p.index] = False
        me.polygons.foreach_set('use_smooth', flags)
    elif bevel:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
        md = ob.modifiers.new('bevel', 'BEVEL'); md.width = bevel; md.segments = 3
        md.limit_method = 'ANGLE'; md.harden_normals = True
    return ob

def decal(name, path_or_mat, p0, p1, p3):
    p2 = vadd(p1, vsub(p3, p0))
    me = bpy.data.meshes.new('esmi ' + name)
    me.from_pydata([tuple(p0), tuple(p1), tuple(p2), tuple(p3)], [], [(3, 2, 1, 0)])
    uv = me.uv_layers.new(name='UVMap')
    for loop, co in zip(me.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv.data[loop.index].uv = co
    me.materials.append(path_or_mat)
    ob = bpy.data.objects.new('esmi ' + name, me); COL.objects.link(ob)
    return ob

FONT = None
def text(name, body, size, material, loc, rot, extrude=.0015):
    cu = bpy.data.curves.new('esmi ' + name, 'FONT')
    cu.body = body; cu.size = size; cu.extrude = extrude; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
    if FONT: cu.font = FONT
    cu.materials.append(material)
    ob = bpy.data.objects.new('esmi ' + name, cu); ob.location = loc; ob.rotation_euler = rot
    COL.objects.link(ob)
    return ob

def cable(name, points, radius, material):
    cu = bpy.data.curves.new('esmi ' + name, 'CURVE'); cu.dimensions = '3D'
    cu.bevel_depth = radius; cu.bevel_resolution = 3; cu.use_fill_caps = True
    cu.bevel_factor_mapping_end = 'SPLINE'
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(points) - 1)
    for bp, p in zip(sp.bezier_points, points):
        bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cu.materials.append(material)
    ob = bpy.data.objects.new('esmi ' + name, cu); COL.objects.link(ob)
    return ob

# --------------------------------------------------------------- model ------
PARTS = []
def part(chapter, pid, objs, explode=(0, 0, 0), **kw):
    p = {'chapter': chapter, 'id': pid, 'objs': objs, 'explode': list(explode)}
    p.update(kw); PARTS.append(p); return p

def build_model(M):
    global FONT
    for path in (r'C:\Windows\Fonts\arialbd.ttf', r'C:\Windows\Fonts\segoeuib.ttf'):
        if os.path.exists(path):
            FONT = bpy.data.fonts.load(path, check_existing=True); break
    logo = image_material('logo', os.path.join(ROOT, 'assets', 'film-v3', 'esmi-logo.png'))
    mark = image_material('mark', os.path.join(ROOT, 'assets', 'film-v3', 'esmi-mark.png'))
    side_rot = (math.radians(90), 0, 0)  # text facing -Y (camera side), reading toward +X

    # 01 · twin hulls ----------------------------------------------------
    HW, BAND, KEEL, DEPTH, XE, SEG, TIPW = .4, .58, .24, 1.05, 3.15, 2.05, .07
    XBOW = 3.45  # the bow sections are longer than the stern sections
    up = [[-HW, 0], [HW, 0], [HW, -BAND], [-HW, -BAND]]
    low = [[-HW, -BAND], [HW, -BAND], [KEEL, -DEPTH], [-KEEL, -DEPTH]]
    ring = lambda x, yc, pts: [[x, yc + y, z] for y, z in pts]
    def end_ring(sign, yc, pts, xtop, xbot, ztop):
        return [[sign * (xtop if z >= ztop - 1e-6 else xbot), yc + y, z] for y, z in pts]
    for side, yc in (('port', 1.25), ('starboard', -1.25)):
        s = 1 if yc > 0 else -1
        out = yc + s * (HW + .004)
        near = 4 if side == 'port' else 0
        objs = [make_mesh(f'{side} hull mid', loft([ring(-SEG, yc, up), ring(SEG, yc, up)]), M['hull'], .012)]
        if side == 'starboard':
            objs.append(decal('hull logo', logo, [-.35, out, -.03], [1.25, out, -.03], [-.35, out, -.513]))
            objs[-1].location.z -= .02
            objs.append(text('hull tagline', 'EBOAT SYSTEM MERCHANDISING INC.', .042, M['text'], (.72, out, -.55), side_rot))
            for x in (-1.6, -1.12, 1.52):
                objs.append(make_mesh(f'vent {x}', box(x, out + .004, -.26, .14, .012, .14), M['vent'], .003))
        part(0, f'{side}-upper-1', objs, (0, s * .55, .35), guide=True, layer=near)
        part(0, f'{side}-lower-1', [make_mesh(f'{side} keel mid', loft([ring(-SEG, yc, low), ring(SEG, yc, low)]), M['hullLow'], .012)], (0, s * 1.2, 0), delay=.1, layer=near)
        outer, inner = yc + s * HW, yc - s * HW
        # Bow: the outer face angles in to a tip on the inner side (the gap between the bows stays straight).
        # Stern: the inner face angles out to a tip on the outer side.
        tips = {1: (inner + s * TIPW, inner), -1: (outer, outer - s * TIPW)}
        for e in (1, -1):
            tag = 'bow' if e > 0 else 'stern'
            x0, x1 = e * SEG, (XBOW if e > 0 else -XE)
            to, ti = tips[e]
            upper = loft([[[x0, outer, 0], [x0, inner, 0], [x0, inner, -BAND], [x0, outer, -BAND]],
                          [[x1, to, 0], [x1, ti, 0], [x1, ti, -BAND], [x1, to, -BAND]]])
            lower = loft([[[x0, outer, -BAND], [x0, inner, -BAND], [x0, yc - s * KEEL, -DEPTH], [x0, yc + s * KEEL, -DEPTH]],
                          [[x1, to, -BAND], [x1, ti, -BAND], [x1, ti, -BAND - .03], [x1, to, -BAND - .03]]])
            part(0, f'{side}-{tag}-upper', [make_mesh(f'{side} hull {tag}', upper, M['hull'], .01),
                make_mesh(f'{side} tip {tag}', box(x1 + e * .012, (to + ti) / 2, -BAND / 2, .024, TIPW + .012, BAND + .01), M['alu'], .006)], (e * 1.0, s * .55, .35), layer=near)
            part(0, f'{side}-{tag}-lower', [make_mesh(f'{side} keel {tag}', lower, M['hullLow'], .01)], (e * 1.1, s * 1.2, 0), delay=.1, layer=near)
        trims = [make_mesh(f'{side} bumper out', tube([-XE, outer, .012], [SEG, outer, .012], .028, 14), M['trim']),
                 make_mesh(f'{side} bumper out bow', tube([SEG, outer, .012], [XBOW, tips[1][0], .012], .028, 14), M['trim']),
                 make_mesh(f'{side} bumper in', tube([-SEG, inner, .012], [XBOW, inner, .012], .028, 14), M['trim']),
                 make_mesh(f'{side} bumper in stern', tube([-SEG, inner, .012], [-XE, tips[-1][1], .012], .028, 14), M['trim'])]
        for e in (1, -1):
            trims.append(make_mesh(f'{side} bumper cap {e}', box((XBOW + .01) if e > 0 else -(XE + .01), sum(tips[e]) / 2, .03, .07, TIPW + .03, .05), M['trim'], .012))
        for x in (-SEG, SEG):
            trims.append(make_mesh(f'{side} seam {x}', box(x, yc + s * (HW + .004), -BAND / 2, .035, .02, BAND), M['trim'], .004))
        part(0, f'{side}-trims', trims, (0, s * 1.05, .6), delay=.3, layer=near + .1)
    for i, x in enumerate((-1.85, -.95, 0, .95, 1.85)):
        part(0, f'crossbeam-{i}', [make_mesh(f'crossbeam {i}', box(x, 0, -.09, .12, 1.74, .08), M['beam'], .01),
            make_mesh(f'beam shoe p{i}', box(x, .89, -.09, .16, .06, .14), M['trim'], .006),
            make_mesh(f'beam shoe s{i}', box(x, -.89, -.09, .16, .06, .14), M['trim'], .006)], (0, 0, .7 + i * .05), delay=.35 + i * .06, guide=True, layer=1)

    # 02 · electric drive (pod motor between the hulls, illustrative) ----------
    part(1, 'drive-mount', [make_mesh('drive mount', box(-1.73, 0, -.2, .3, .3, .14), M['motorMid'], .01),
        make_mesh('mount plate', box(-1.73, 0, -.125, .42, .42, .02), M['plate'], .004)], (-1.0, 0, .9), layer=3, guide=True)
    part(1, 'drive-motor', [make_mesh('drive motor', tube([-1.51, 0, -.4], [-1.95, 0, -.4], .13, 28), M['motor']),
        make_mesh('motor end cap', tube([-1.49, 0, -.4], [-1.53, 0, -.4], .115, 28), M['fins']),
        make_mesh('motor band', tube([-1.7, 0, -.4], [-1.76, 0, -.4], .135, 28), M['orange'])], (-1.7, 0, 1.1), rot=(2, 1.0), layer=3, guide=True)
    part(1, 'drive-shaft', [make_mesh('drive shaft', tube([-1.95, 0, -.4], [-2.12, 0, -.6], .03, 12), M['fins']),
        make_mesh('shaft strut', box(-2.04, 0, -.5, .05, .03, .22), M['motorMid'], .004)], (-2.3, 0, .9), layer=3)
    prop = [make_mesh('prop hub', tube([-2.12, 0, -.6], [-2.22, 0, -.6], .045, 16), M['prop'])]
    for i in range(3):
        a = i / 3 * TAU; b = a + .5; r0, r1 = .04, .17
        pt = lambda x, ang, r: [x, math.cos(ang) * r, -.6 + math.sin(ang) * r]
        prop.append(make_mesh(f'prop blade {i}', hexa([pt(-2.15, a, r0), pt(-2.18, a, r1), pt(-2.18, b, r1), pt(-2.15, b, r0), pt(-2.17, a, r0), pt(-2.2, a, r1), pt(-2.2, b, r1), pt(-2.17, b, r0)]), M['prop'], .006))
    part(1, 'propeller', prop, (-3.0, 0, .9), spin=((1, 0, 0), (-2.17, 0, -.6), 3), layer=3, guide=True)

    # 03 · battery pack (under the deck, illustrative) ----------------------
    BZ = -.44
    part(2, 'battery-tray', [make_mesh('battery tray', box(.15, 0, -.545, 2.05, 1.06, .03), M['tray'], .006),
        make_mesh('tray lip p', box(.15, .54, -.5, 2.05, .02, .08), M['tray'], .004), make_mesh('tray lip s', box(.15, -.54, -.5, 2.05, .02, .08), M['tray'], .004)], (0, 0, .8), layer=3, guide=True)
    m = 0
    for x in (-.6, -.1, .4, .9):
        for y in (.26, -.26):
            objs = [make_mesh(f'battery {m}', box(x, y, BZ, .44, .44, .18), M['battery'], .012), make_mesh(f'battery lid {m}', box(x, y, BZ + .093, .38, .38, .006), M['batteryTop'], .002),
                    make_mesh(f'terminal + {m}', tube([x - .12, y, BZ + .09], [x - .12, y, BZ + .13], .022, 12), M['red']), make_mesh(f'terminal - {m}', tube([x + .12, y, BZ + .09], [x + .12, y, BZ + .13], .022, 12), M['black'])]
            part(2, f'battery-module-{m}', objs, ((m // 2 - 1.5) * .38, -.5 if m % 2 else .5, 1.0 + m * .02), rot=(2, .5 + m * .05), delay=.1 + m * .075, span=.3, layer=3, guide=m % 2 == 0)
            m += 1
    for i, x in enumerate((-.35, .15, .65)):
        part(2, f'busbar-{i}', [make_mesh(f'busbar p{i}', box(x, .26, BZ + .135, .32, .05, .012), M['copper'], .003), make_mesh(f'busbar s{i}', box(x, -.26, BZ + .135, .32, .05, .012), M['copper'], .003)], (0, 0, .9), delay=.78 + i * .05, span=.15, layer=3.2)
    part(2, 'bms', [make_mesh('bms', box(1.45, .3, -.47, .24, .2, .1), M['green'], .008), make_mesh('bms lid', box(1.45, .3, -.416, .2, .16, .008), M['batteryTop'], .002)], (.9, .8, 1.2), delay=.7, layer=3)

    # 04 · electrical system -------------------------------------------------
    ctrl = [make_mesh('controller', box(-1.25, -.3, -.45, .34, .3, .14), M['controller'], .01)]
    for i in range(6):
        ctrl.append(make_mesh(f'fin {i}', box(-1.25, -.42 + i * .048, -.36, .3, .012, .045), M['fins'], .002))
    part(3, 'motor-controller', ctrl, (-.7, -.8, 1.45), rot=(2, -.8), layer=3, guide=True)
    part(3, 'distribution-box', [make_mesh('distribution', box(-1.25, .32, -.46, .28, .24, .12), M['batteryTop'], .01),
        make_mesh('isolator', tube([-1.25, .32, -.4], [-1.25, .32, -.34], .04, 16), M['red']), make_mesh('isolator key', box(-1.25, .32, -.33, .1, .02, .02), M['red'], .003)], (-.7, .8, 1.45), rot=(2, .7), delay=.08, layer=3)
    part(3, 'solar-charger', [make_mesh('solar charger', box(1.45, -.3, -.47, .24, .22, .1), M['charger'], .008), make_mesh('charger display', box(1.45, -.3, -.416, .18, .12, .008), M['screen'], .002)], (.9, -.8, 1.45), rot=(2, -.6), delay=.14, layer=3)
    cables = [([[-.72, .3, -.31], [-.95, .32, -.34], [-1.11, .32, -.4]], 'red', .016),
              ([[-.72, -.2, -.31], [-.95, 0, -.34], [-1.13, .22, -.4]], 'black', .016),
              ([[-1.25, .2, -.4], [-1.27, .05, -.36], [-1.25, -.15, -.4]], 'orange', .014)]
    cables += [([[-1.42, -.3 + d, -.42], [-1.55, -.18 + d, -.34], [-1.7, d * .6, -.27]], 'orange', .012) for d in (-.04, 0, .04)]
    cables += [([[-1.08, -.42, -.42], [-.3, -.1, -.3], [.8, .6, -.2], [1.05, .7, .05]], 'black', .008),
               ([[1.33, -.3, -.44], [1.2, -.27, -.36], [1.12, -.26, -.31]], 'red', .01),
               ([[1.55, -.38, -.44], [1.3, -.75, -.25], [1.0, -.82, -.12]], 'blue', .01)]
    for i, (pts, c, r) in enumerate(cables):
        part(3, f'cable-{i}', [cable(f'cable {i}', pts, r * 1.5, M[c])], (0, 0, 1.2 + i * .04), delay=.3 + i * .055, span=.35, layer=3.5)

    # 05 · flush deck --------------------------------------------------------
    DX = [-SEG, -SEG / 2, 0, SEG / 2, SEG]
    d = 0
    for i in range(4):
        for y0, y1 in ((0, .87), (-.87, 0)):
            part(4, f'deck-panel-{d}', [make_mesh(f'deck panel {d}', box((DX[i] + DX[i + 1]) / 2, (y0 + y1) / 2, -.02, DX[i + 1] - DX[i] - .01, y1 - y0 - .01, .04), M['deck'], .006)],
                 (0, (y0 + y1) * 1.2, 1.5 + d * .07), rot=(2, (-1 if d % 2 else 1) * .25), delay=d * .07, span=.35, layer=6, guide=d % 3 == 0)
            d += 1
    for e in (1, -1):
        part(4, f'deck-trim-{"bow" if e > 0 else "stern"}', [make_mesh(f'deck end beam {e}', box(e * (SEG + .025), 0, -.06, .05, 1.72, .1), M['alu'], .008)], (e * 1.0, 0, .9), delay=.62, span=.25, layer=6.2)

    # 06 · aluminium frame ---------------------------------------------------
    RX0, RX1, RY, RZ, RR = -1.95, 1.9, 1.2, .55, .2
    def rail_post(name, x, y):
        return [make_mesh(name + ' plate', box(x, y, .012, .13, .13, .024), M['plate'], .006), make_mesh(name + ' post', sq([x, y, .024], [x, y, RZ - .03], .05), M['alu'], .006), make_mesh(name + ' clamp', box(x, y, RZ, .08, .08, .07), M['alu'], .008)]
    posts = [(-1.75, 1), (-.6, 1), (.6, 1), (1.7, 1), (-1.75, -1), (-.6, -1), (.6, -1), (1.7, -1)]
    for i, (x, s) in enumerate(posts):
        part(5, f'rail-post-{i}', rail_post(f'rail post {i}', x, s * RY), (0, s * (1.1 + (i % 4) * .08), .7 + (i % 4) * .08), delay=.05 + (i % 4) * .045, span=.26, layer=8)
    part(5, 'rail-post-stern', rail_post('rail post stern', RX0, 0), (-1, 0, .8), delay=.2, span=.26, layer=8)
    rt = lambda n, a, b: make_mesh(n, tube(a, b, .028, 16), M['alu'])
    for s in (1, -1):
        part(5, f'rail-side-{"p" if s > 0 else "s"}', [rt(f'rail side {s}', [RX0 + RR, s * RY, RZ], [RX1 - RR, s * RY, RZ])], (0, s * 1.6, 1.4), delay=.32, span=.3, layer=8.1, guide=True)
    part(5, 'rail-stern', [rt('rail stern', [RX0, -RY + RR, RZ], [RX0, RY - RR, RZ])], (-1.2, 0, 1.4), delay=.36, span=.3, layer=8.1)
    part(5, 'rail-bow', [rt('rail bow', [RX1, -RY + RR, RZ], [RX1, RY - RR, RZ])], (1.2, 0, 1.4), delay=.38, span=.3, layer=8.1)
    for ci, (cx, cy, a0) in enumerate(((RX1 - RR, RY - RR, 0), (RX0 + RR, RY - RR, math.pi / 2), (RX0 + RR, -RY + RR, math.pi), (RX1 - RR, -RY + RR, 1.5 * math.pi))):
        pts = [[cx + math.cos(a0 + k / 6 * math.pi / 2) * RR, cy + math.sin(a0 + k / 6 * math.pi / 2) * RR, RZ] for k in range(7)]
        part(5, f'rail-corner-{ci}', [rt(f'rail corner {ci}-{k}', pts[k], pts[k + 1]) for k in range(6)], ((1 if cx > 0 else -1) * .9, (1 if cy > 0 else -1) * 1.2, 1.5), delay=.44 + ci * .03, span=.22, layer=8.1)
    UY, KZ, TZ = 1.3, 1.72, 2.3
    fp = 0
    for bx, kx in ((-1.75, -1.82), (1.0, 1.3)):
        for s in (1, -1):
            base, knee = [bx, s * UY, 0], [kx, s * UY, KZ]
            objs = [make_mesh(f'upright plate {fp}', box(bx, s * UY, .015, .16, .16, .03), M['plate'], .006), make_mesh(f'upright {fp}', sq(base, knee, .075), M['alu'], .008),
                    make_mesh(f'knuckle {fp}', box(kx, s * UY, KZ, .12, .12, .12), M['knuckle'], .015),
                    make_mesh(f'branch a {fp}', sq(knee, [kx - .55, s * UY, TZ], .06), M['alu'], .006), make_mesh(f'branch b {fp}', sq(knee, [kx + .55, s * UY, TZ], .06), M['alu'], .006)]
            part(5, f'upright-{fp}', objs, (0, s * 1.2, 1.9 + fp * .05), rot=(0, s * .3), delay=.5 + fp * .06, span=.3, layer=8, guide=True)
            fp += 1
    BX0, BX1 = -2.55, 2.0
    for i, s in enumerate((1, -1)):
        part(5, 'roof-frame' if i == 0 else 'roof-beam-s', [make_mesh(f'roof beam {s}', sq([BX0, s * UY, TZ + .035], [BX1, s * UY, TZ + .035], .07), M['alu'], .008),
            make_mesh(f'roof knuckle a{s}', box(-1.82, s * UY, TZ - .005, .14, .1, .05), M['knuckle'], .01), make_mesh(f'roof knuckle b{s}', box(1.3, s * UY, TZ - .005, .14, .1, .05), M['knuckle'], .01)],
            (0, s * .7, 1.0), delay=.74 + i * .04, span=.24, layer=9, guide=i == 0)
    for i, x in enumerate((BX0, -1.82, -.3, 1.3, BX1)):
        part(5, f'roof-bar-{i}', [make_mesh(f'roof bar {i}', sq([x, -UY, TZ + .035], [x, UY, TZ + .035], .06), M['alu'], .006)], (0, 0, 1.2 + i * .05), rot=(2, .5), delay=.8 + i * .03, span=.18, layer=9)

    # 07 · bucket seats ------------------------------------------------------
    def seat(n, x, y):
        hx = hy = .25; SB = .34; b0, b1 = x - .22, x - .3
        return [
            [make_mesh(f'seat {n} base', box(x, y, SB / 2, .52, .52, SB), M['seatBase'], .02), make_mesh(f'seat {n} swivel', box(x, y, SB + .01, .44, .44, .02), M['seatShell'], .005)],
            [make_mesh(f'seat {n} pan', box(x, y, SB + .06, 2 * hx, 2 * hy, .08), M['seatShell'], .02),
             make_mesh(f'seat {n} cushion', hexa([[x - .21, y - .215, .44], [x + .23, y - .215, .44], [x + .23, y + .215, .44], [x - .21, y + .215, .44], [x - .21, y - .215, .52], [x + .23, y - .215, .535], [x + .23, y + .215, .535], [x - .21, y + .215, .52]]), M['seatPad'], .03)],
            [make_mesh(f'seat {n} back', hexa([[b0 - .1, y - hy, .4], [b0, y - hy, .4], [b0, y + hy, .4], [b0 - .1, y + hy, .4], [b1 - .1, y - hy + .01, 1.02], [b1, y - hy + .01, 1.02], [b1, y + hy - .01, 1.02], [b1 - .1, y + hy - .01, 1.02]]), M['seatShell'], .03),
             make_mesh(f'seat {n} back pad', hexa([[b0, y - .215, .53], [b0 + .05, y - .215, .53], [b0 + .05, y + .215, .53], [b0, y + .215, .53], [b1 + .005, y - .205, .96], [b1 + .055, y - .205, .96], [b1 + .055, y + .205, .96], [b1 + .005, y + .205, .96]]), M['seatPad'], .012)],
            [o for k in (-1, 1) for o in (make_mesh(f'seat {n} arm {k}', box(x - .01, y + k * (hy + .02), .66, .34, .05, .05), M['seatShell'], .015),
                                         make_mesh(f'seat {n} arm post {k}', sq([x + .13, y + k * (hy + .02), .64], [x + .07, y + k * (hy + .02), .44], .045), M['seatShell'], .01))],
        ]
    seats = [(-1.05, -.55), (.35, .62), (.3, -.55), (-1.05, .55)]
    lift = [(0, 0, 0), (0, 0, .35), (-.3, 0, .7), (0, 0, .5)]
    names = ['base', 'cushion', 'back', 'arms']
    for i, (x, y) in enumerate(seats):
        for k, objs in enumerate(seat(i, x, y)):
            ex = [lift[k][0] + .12 * (1 if i % 2 else -1), y * (.9 + (.4 if k == 3 else 0)), lift[k][2] + 1.6 + i * .06]
            part(6, f'seat-{i}' if k == 0 else f'seat-{i}-{names[k]}', objs, ex, rot=(2, (1 if i % 2 else -1) * .5), delay=i * .12 + k * .04, span=.3, layer=8 + k * .05, guide=k == 0)

    # 08 · helm --------------------------------------------------------------
    # White console at the front of the cockpit (as in the product photo): the ESMI logo
    # sits large on the bow-facing (+X) face, a smoked dash visor leans back toward the
    # driver, and the wheel comes out of the back on a dark column.
    cx0, cx1, cy0, cy1, ch = 1.2, 1.7, .38, 1.02, 1.0
    fx, ym = cx1 + .004, (cy0 + cy1) / 2
    front_rot = (math.radians(90), 0, math.radians(90))  # text on the +X face, reading toward +Y
    mw, mh = .34, .34 * 235 / 360
    vx0, vx1, vt = cx1 - .1, cx1 - .3, .4                 # visor foot / top x, visor height
    visor = hexa([[vx0, cy1 - .07, ch], [vx0 + .025, cy1 - .07, ch], [vx0 + .025, cy0 + .07, ch], [vx0, cy0 + .07, ch],
                  [vx1, cy1 - .1, ch + vt], [vx1 + .025, cy1 - .1, ch + vt], [vx1 + .025, cy0 + .1, ch + vt], [vx1, cy0 + .1, ch + vt]])
    console = [make_mesh('console', box((cx0 + cx1) / 2, ym, ch / 2, cx1 - cx0, cy1 - cy0, ch), M['console'], .045),
               make_mesh('console foot', box((cx0 + cx1) / 2, ym, .025, cx1 - cx0 + .03, cy1 - cy0 + .03, .05), M['plate'], .008),
               make_mesh('console dash', box(cx1 - .2, ym, ch + .012, .36, cy1 - cy0 - .08, .024), M['plate'], .008),
               decal('console mark', mark, [fx, ym - mw / 2, .975], [fx, ym + mw / 2, .975], [fx, ym - mw / 2, .975 - mh]),
               text('console word', 'ESMI', .27, M['text'], (fx, ym, .64), front_rot, extrude=.002),
               text('console tagline', 'EBOAT SYSTEM MERCHANDISING INC.', .03, M['text'], (fx, ym, .515), front_rot)]
    part(7, 'console', console, (1.3, .4, 1.8), rot=(2, -.6), layer=8, guide=True)
    part(7, 'windscreen', [make_mesh('windscreen', visor, M['glass'], .02)],
         (1.2, .3, 2.6), rot=(1, -.5), delay=.3, layer=8.3)
    wc, wn = [cx0 - .24, .7, 1.08], vnorm([-1, 0, .6])
    wu, wv = basis(wn)
    wp = lambda a, r=.2: vadd(wc, vadd(vmul(wu, math.cos(a) * r), vmul(wv, math.sin(a) * r)))
    wheel = [make_mesh(f'wheel rim {i}', tube(wp(i / 28 * TAU), wp((i + 1.06) / 28 * TAU), .022, 10), M['wheel']) for i in range(28)]
    wheel += [make_mesh(f'wheel spoke {i}', tube(wc, wp(i / 3 * TAU + .5), .016, 8), M['wheel']) for i in range(3)]
    wheel.append(make_mesh('wheel hub', tube(vadd(wc, vmul(wn, .03)), vadd(wc, vmul(wn, -.05)), .05, 16), M['wheel']))
    part(7, 'steering-wheel', wheel, (-.5, .3, 1.9), spin=(tuple(wn), tuple(wc), 1.2), delay=.5, layer=8.5, guide=True)
    part(7, 'helm-column', [make_mesh('helm column', sq([cx0, .7, .84], vadd(wc, vmul(wn, -.05)), .07), M['wheel'], .01), make_mesh('helm pod', box(cx0 - .01, .7, .78, .04, .2, .14), M['wheel'], .01),
        make_mesh('throttle lever', tube([cx0 - .02, .47, .9], [cx0 - .1, .47, 1.0], .012, 8), M['wheel']), make_mesh('throttle knob', tube([cx0 - .1, .45, 1.0], [cx0 - .1, .49, 1.0], .022, 12), M['red'])],
         (-.4, .2, 1.5), delay=.38, layer=8.4)

    # 09 · solar canopy -----------------------------------------------------
    SZ, SX0, SX1, SY = 2.4, -2.95, 2.35, 1.8
    edges = [(box((SX0 + SX1) / 2, SY, SZ, SX1 - SX0, .07, .08), (0, .9, 1.4)), (box((SX0 + SX1) / 2, -SY, SZ, SX1 - SX0, .07, .08), (0, -.9, 1.4)),
             (box(SX0, 0, SZ, .07, 2 * SY, .08), (-.9, 0, 1.4)), (box(SX1, 0, SZ, .07, 2 * SY, .08), (.9, 0, 1.4))]
    cols, rows = 4, 3
    px, py = (SX1 - SX0) / cols, 2 * SY / rows
    for i, (solid, e) in enumerate(edges):
        objs = [make_mesh(f'canopy edge {i}', solid, M['solarEdge'], .01)]
        if i < 2:
            yy = SY if i == 0 else -SY
            objs += [make_mesh(f'canopy corner {i}a', box(SX0, yy, SZ, .1, .1, .09), M['knuckle'], .01), make_mesh(f'canopy corner {i}b', box(SX1, yy, SZ, .1, .1, .09), M['knuckle'], .01)]
        if i == 0:
            # Aluminium mullions that fill the gaps between the solar modules.
            objs += [make_mesh(f'canopy mullion x{k}', box(SX0 + k * px + .015, 0, SZ, .06, 2 * SY, .065), M['solarEdge'], .006) for k in range(1, cols)]
            objs += [make_mesh(f'canopy mullion y{k}', box((SX0 + SX1) / 2, -SY + k * py + .015, SZ, SX1 - SX0, .06, .065), M['solarEdge'], .006) for k in range(1, rows)]
        part(8, 'canopy-edge' if i == 0 else f'canopy-edge-{i}', objs, e, delay=i * .03, span=.2, layer=10, guide=i == 0)
    sp = 0
    for i in range(cols):
        for j in range(rows):
            x0 = SX0 + i * px + .04; x1 = x0 + px - .05; y0 = -SY + j * py + .04; y1 = y0 + py - .05
            part(8, f'solar-module-{sp}', [make_mesh(f'solar module {sp}', box((x0 + x1) / 2, (y0 + y1) / 2, SZ, x1 - x0, y1 - y0, .05), M['solar'], .006)],
                 ((i - 1.5) * .45, (j - 1) * .7, 1.9 + sp * .03), rot=(2, (-1 if sp % 2 else 1) * .45), delay=.15 + sp * .055, span=.26, layer=10.5, guide=sp % 3 == 1)
            sp += 1

    # Exploded view tiers: hulls low, systems, deck, cabin, roof, sun.
    bpy.context.view_layer.update()
    tiers = [None, 1.3, 1.3, 1.45, 2.4, 3.2, 3.25, 3.4, 5.0]
    by = {}
    for p in PARTS: by.setdefault(p['chapter'], []).append(p)
    for chapter, lst in by.items():
        tier = tiers[chapter]
        if tier is None: continue
        mean = sum(p['explode'][2] for p in lst) / len(lst)
        for p in lst:
            if p.get('draw'): continue
            pz = pivot_of(p)[2]
            roof = chapter == 5 and pz > 1.6
            target = (4.3 if roof else tier) + (p['explode'][2] - mean) * .25
            p['explode'][2] = max(p['explode'][2] * .2, target - pz)

def world_points(ob):
    if ob.type == 'MESH':
        return [ob.matrix_world @ v.co for v in ob.data.vertices]
    return [ob.matrix_world @ Vector(c) for c in ob.bound_box]

def pivot_of(p):
    if 'pivot' in p: return p['pivot']
    pts = [v for ob in p['objs'] for v in world_points(ob)]
    c = sum(pts, Vector()) / len(pts)
    p['pivot'] = c
    return c

# ------------------------------------------------------------ animation -----
WINDOWS = [(0, .12), (.12, .22), (.22, .32), (.32, .42), (.42, .53), (.53, .63), (.63, .73), (.73, .83), (.83, .94)]

def fcurves(idblock):
    ad = idblock.animation_data
    if not ad or not ad.action: return []
    act = ad.action
    try:
        return list(act.fcurves)
    except Exception:
        out = []
        for layer in act.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    out += list(bag.fcurves)
        return out

def style_keys(idblock, frame, interpolation, easing='EASE_OUT'):
    for fc in fcurves(idblock):
        for kp in fc.keyframe_points:
            if round(kp.co[0]) == frame:
                kp.interpolation = interpolation; kp.easing = easing
                if interpolation == 'BACK': kp.back = BACK

def animate(sc):
    by = {}
    for p in PARTS: by.setdefault(p['chapter'], []).append(p)
    for chapter, lst in by.items():
        w0, w1 = WINDOWS[chapter]
        for i, p in enumerate(lst):
            delay = p.get('delay', i / (len(lst) - 1) * .55 if len(lst) > 1 else 0)
            span = p.get('span', .45)
            p['start'] = w0 + (w1 - w0) * clamp(delay, 0, 1 - span)
            p['end'] = p['start'] + (w1 - w0) * span
    for p in PARTS:
        f0, f1 = F(p['start']), max(F(p['start']) + 1, F(p['end']))
        if p.get('draw'):
            cu = p['objs'][0].data
            cu.bevel_factor_end = 0; cu.keyframe_insert('bevel_factor_end', frame=f0)
            cu.bevel_factor_end = 1; cu.keyframe_insert('bevel_factor_end', frame=f1)
            style_keys(cu, f0, 'SINE', 'EASE_IN_OUT')
            continue
        spin = p.get('spin')
        pivot = Vector(spin[1]) if spin else pivot_of(p)
        em = bpy.data.objects.new('esmi part ' + p['id'], None)
        em.empty_display_size = .05; em.empty_display_type = 'PLAIN_AXES'
        COL.objects.link(em)
        em.location = pivot
        inv = Matrix.Translation(-pivot)
        for ob in p['objs']:
            ob.parent = em; ob.matrix_parent_inverse = inv
        p['empty'] = em
        ex = Vector(p['explode'])
        em.location = pivot + ex; em.keyframe_insert('location', frame=f0)
        em.location = pivot; em.keyframe_insert('location', frame=f1)
        rot = p.get('rot')
        if spin:
            em.rotation_mode = 'AXIS_ANGLE'
            em.rotation_axis_angle = (spin[2] * TAU, *spin[0]); em.keyframe_insert('rotation_axis_angle', frame=f0)
            em.rotation_axis_angle = (0, *spin[0]); em.keyframe_insert('rotation_axis_angle', frame=f1)
        elif rot:
            axis, ang = rot
            r = [0, 0, 0]; r[axis] = ang; em.rotation_euler = r; em.keyframe_insert('rotation_euler', frame=f0)
            em.rotation_euler = (0, 0, 0); em.keyframe_insert('rotation_euler', frame=f1)
        style_keys(em, f0, 'BACK')
    return by

# ------------------------------------------------------------ studio --------
def studio(sc, M):
    # Seamless cove: flat floor that curves up into a wall all around.
    prof = [(0, -1.07)] + [(45, -1.07)] + [(45 + 10 * math.sin(a / 12 * math.pi / 2), -1.07 + 10 * (1 - math.cos(a / 12 * math.pi / 2))) for a in range(1, 13)] + [(55, 60)]
    seg = 96
    verts = [(0, 0, -1.07)]
    for k in range(seg):
        t = k / seg * TAU
        for r, z in prof[1:]:
            verts.append((math.cos(t) * r, math.sin(t) * r, z))
    n = len(prof) - 1
    faces = []
    for k in range(seg):
        a, b = 1 + k * n, 1 + ((k + 1) % seg) * n
        faces.append((0, a, b))
        for i in range(n - 1):
            faces.append((a + i, a + i + 1, b + i + 1, b + i))
    me = bpy.data.meshes.new('esmi studio'); me.from_pydata(verts, [], faces)
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    me.materials.append(M['studio'])
    ob = bpy.data.objects.new('esmi studio', me); COL.objects.link(ob)
    world = bpy.data.worlds.get('esmi world') or bpy.data.worlds.new('esmi world')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    bg.inputs['Color'].default_value = (*srgb('#e4e4e2'), 1); bg.inputs['Strength'].default_value = .3
    sc.world = world
    def area(name, loc, energy, size, size_y=None, color='#ffffff'):
        li = bpy.data.lights.new('esmi ' + name, 'AREA'); li.energy = energy; li.shape = 'RECTANGLE'
        li.size = size; li.size_y = size_y or size; li.color = srgb(color)
        ob = bpy.data.objects.new('esmi ' + name, li); ob.location = loc; COL.objects.link(ob)
        con = ob.constraints.new('TRACK_TO'); con.target = TARGET0; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
        return ob
    area('key light', (6.5, -7, 7), 2600, 6, 4, '#fff8f0')
    area('fill light', (-6, -6, 3.5), 700, 7, 5, '#eef3ff')
    area('top light', (-2, 3, 9), 1100, 6, 4)
    area('rim light', (-7, 6, 5), 1300, 5, 5)

TARGET0 = None
def camera_rig(sc):
    global TARGET0
    TARGET0 = bpy.data.objects.new('esmi light target', None); TARGET0.location = (0, 0, .6); COL.objects.link(TARGET0)
    tgt = bpy.data.objects.new('esmi camera target', None); tgt.location = (0, 0, .7); COL.objects.link(tgt)
    cd = bpy.data.cameras.new('esmi camera'); cd.lens = 55; cd.sensor_width = 36
    cam = bpy.data.objects.new('esmi camera', cd); COL.objects.link(cam)
    con = cam.constraints.new('TRACK_TO'); con.target = tgt; con.track_axis = 'TRACK_NEGATIVE_Z'; con.up_axis = 'UP_Y'
    sc.camera = cam
    return cam, tgt

def frame_points(sc, active_only):
    pts = []
    for p in PARTS:
        if active_only and p['chapter'] != 0 and sc.frame_current < F(p['start']):
            continue
        cs = [ob.matrix_world @ Vector(c) for ob in p['objs'] for c in ob.bound_box]
        lo = Vector((min(c.x for c in cs), min(c.y for c in cs), min(c.z for c in cs)))
        hi = Vector((max(c.x for c in cs), max(c.y for c in cs), max(c.z for c in cs)))
        pts += [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    return pts

def fit(sc, cam, tgt, pts, az, el, fw, fh, cx, cy):
    """Place the camera on a sphere (az, el) so pts fill fw x fh of frame, centred at (cx, cy)."""
    from bpy_extras.object_utils import world_to_camera_view
    d = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
    center = sum(pts, Vector()) / len(pts)
    dist = 14.0
    target = center.copy()
    for _ in range(6):
        tgt.location = target; cam.location = target + d * dist
        bpy.context.view_layer.update()
        ndc = [world_to_camera_view(sc, cam, p) for p in pts]
        x0, x1 = min(q.x for q in ndc), max(q.x for q in ndc)
        y0, y1 = min(q.y for q in ndc), max(q.y for q in ndc)
        scale = max((x1 - x0) / fw, (y1 - y0) / fh)
        # shift the target so the box centre lands on (cx, cy)
        mx, my = (x0 + x1) / 2 - cx, (y0 + y1) / 2 - (1 - cy)
        right = cam.matrix_world.to_3x3() @ Vector((1, 0, 0)); upv = cam.matrix_world.to_3x3() @ Vector((0, 1, 0))
        half_w = dist * (cam.data.sensor_width / 2) / cam.data.lens
        half_h = half_w * sc.render.resolution_y / sc.render.resolution_x
        target = target + right * (mx * 2 * half_w) + upv * (my * 2 * half_h)
        dist *= scale
    return target, dist

def animate_camera(sc, cam, tgt):
    samples = list(range(1, FRAMES + 1, 6)) + [FRAMES]
    end_fit = None
    keys = []
    for f in samples:
        sc.frame_set(f)
        a = (f - 1) / (FRAMES - 1)
        e = ease_in_out(a)
        az, el = math.radians(lerp(-64, -50, e)), math.radians(lerp(26, 17, e))
        fe = ease_in_out(clamp(a / .94))
        fw, fh, cx, cy = lerp(.86, .64, fe), lerp(.88, .76, fe), lerp(.47, .5, fe), lerp(.5, .54, fe)
        t_all, d_all = fit(sc, cam, tgt, frame_points(sc, False), az, el, fw, fh, cx, cy)
        k = .5 * smooth(a / .16)
        if k > 0:
            t_act, d_act = fit(sc, cam, tgt, frame_points(sc, True), az, el, fw, fh, cx, cy)
            t, d = t_all.lerp(t_act, k), lerp(d_all, d_act, k)
        else:
            t, d = t_all, d_all
        keys.append((f, az, el, t, d))
    # settle onto the photographic handoff framing over the last stretch
    sc.frame_set(FRAMES)
    az1, el1 = math.radians(-50), math.radians(17)
    t_end, d_end = fit(sc, cam, tgt, frame_points(sc, False), az1, el1, .66, .8, .5, .53)
    for f, az, el, t, d in keys:
        a = (f - 1) / (FRAMES - 1)
        m = smooth((a - .82) / .14)
        t = t.lerp(t_end, m); d = lerp(d, d_end, m)
        dvec = Vector((math.cos(el) * math.cos(az), math.cos(el) * math.sin(az), math.sin(el)))
        tgt.location = t; tgt.keyframe_insert('location', frame=f)
        cam.location = t + dvec * d; cam.keyframe_insert('location', frame=f)
    for f in (FRAMES + 23,):
        tgt.keyframe_insert('location', frame=f); cam.keyframe_insert('location', frame=f)

# ------------------------------------------------------------ render --------
def render_settings(sc):
    sc.render.engine = 'CYCLES'
    sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1920, 1080, 100
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        for kind in ('OPTIX', 'CUDA'):
            try:
                prefs.compute_device_type = kind; prefs.get_devices()
                gpus = [d for d in prefs.devices if d.type == kind]
                if gpus:
                    for d in prefs.devices: d.use = d.type == kind
                    sc.cycles.device = 'GPU'
                    break
            except Exception:
                continue
    except Exception:
        pass
    sc.cycles.samples = 96
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.use_denoising = True
    try: sc.cycles.denoiser = 'OPTIX' if sc.cycles.device == 'GPU' else 'OPENIMAGEDENOISE'
    except Exception: pass
    sc.cycles.max_bounces = 8
    try:
        sc.view_settings.view_transform = 'AgX'
        sc.view_settings.look = 'AgX - Punchy'
    except Exception:
        pass
    sc.view_settings.exposure = -0.45
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.quality = 88

def build():
    global COL, PARTS
    PARTS = []
    sc = new_scene()
    COL = bpy.data.collections.get('esmi boat') or bpy.data.collections.new('esmi boat')
    if COL.name not in sc.collection.children: sc.collection.children.link(COL)
    M = build_materials()
    build_model(M)
    cam, tgt = camera_rig(sc)
    studio(sc, M)
    animate(sc)
    render_settings(sc)
    animate_camera(sc, cam, tgt)
    sc.frame_set(1)
    return sc

if __name__ == '__main__' or True:
    SCENE_OBJ = build()
    print('ESMI scene built:', len(PARTS), 'parts,', len([o for o in COL.objects]), 'objects; device', SCENE_OBJ.cycles.device)
