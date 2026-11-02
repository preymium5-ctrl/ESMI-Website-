// ESMI exploded assembly — a live SVG illustration driven by the scroll story.
// The boat is described as simple 3D solids (boxes, lofts, tubes and cables),
// projected with an axonometric camera and shaded per face. Every part has an
// exploded position; scroll progress brings each one home in chapter order.
// Illustrative internal layout: not a manufacturing model.

const NS = 'http://www.w3.org/2000/svg';
const W = 1920, H = 1080;
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = t => 1 - Math.pow(1 - clamp(t), 3);
const easeBack = t => { t = clamp(t); const c = 1.25; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeInOut = t => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

/* ---------- vector helpers ---------- */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/* ---------- solid builders ---------- */
const BOX_FACES = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
function hexa(v) { return { verts: v, faces: BOX_FACES }; }
function box(cx, cy, cz, sx, sy, sz) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  return hexa([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]);
}
function loft(rings, caps = true) {
  const n = rings[0].length, verts = rings.flat(), faces = [];
  for (let k = 0; k < rings.length - 1; k++) for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    faces.push([k * n + i, k * n + j, (k + 1) * n + j, (k + 1) * n + i]);
  }
  if (caps) { faces.push([...Array(n).keys()]); faces.push([...Array(n).keys()].map(i => (rings.length - 1) * n + i)); }
  return { verts, faces };
}
function basis(axis) {
  const a = norm(axis);
  const helper = Math.abs(a[2]) < .9 ? [0, 0, 1] : [1, 0, 0];
  const u = norm(cross(a, helper)), v = cross(a, u);
  return [u, v];
}
function tube(p0, p1, r, sides = 8) {
  const [u, v] = basis(sub(p1, p0));
  const ring = c => Array.from({ length: sides }, (_, i) => {
    const a = i / sides * TAU;
    return add(c, add(mul(u, Math.cos(a) * r), mul(v, Math.sin(a) * r)));
  });
  return loft([ring(p0), ring(p1)]);
}
/* ---------- the ESMI E-Boat model (from reference/esmi-product.jpeg) ---------- */
// Bow is +x, port (the side facing the camera) is +y, hull tops sit at z = 0.
const C = {
  hull: '#cfd2d6', hullLow: '#5f6368', trim: '#2c2f33', vent: '#24272b', beam: '#a7acb2', deck: '#8a8e93', deckTrim: '#3a3d42',
  alu: '#b9bdc2', plate: '#2f3236', knuckle: '#34373b', seatShell: '#232528', seatPad: '#b8bbbf', seatBase: '#45484d',
  console: '#f1f2f3', glass: '#3b4148', wheel: '#1c1e21', solar: '#1f3170', solarEdge: '#c9cdd2',
  battery: '#dadde0', batteryTop: '#9aa6b0', tray: '#4a4f55', controller: '#50565d', fins: '#7d838a',
  motor: '#1f2124', motorMid: '#3a3d42', prop: '#2f3338', copper: '#c27c43', red: '#c43c32', black: '#26282b',
  orange: '#e07a2c', blue: '#2f7fb3', green: '#5f8f6a',
};
const textDecal = (text, w, h, size, weight, spacing = 0) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><text x="${w / 2}" y="${h * .82}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="${weight}" font-size="${size}" letter-spacing="${spacing}" fill="#1d4a5b">${text}</text></svg>`)}`;
const WORD = textDecal('ESMI', 300, 90, 96, 800, 2);
const TAGLINE = textDecal('EBOAT SYSTEM MERCHANDISING INC.', 640, 40, 31, 600, 1);

// Square aluminium tube from p0 to p1.
function sq(p0, p1, w, d = w) {
  const [u, v] = basis(sub(p1, p0));
  const ring = c => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(c, add(mul(u, a * w / 2), mul(v, b * d / 2))));
  return loft([ring(p0), ring(p1)]);
}

function buildModel() {
  const parts = [];
  const part = (chapter, id, prims, opts = {}) => { const p = { chapter, id, prims, explode: [0, 0, 0], ...opts }; parts.push(p); return p; };
  const mesh = (solid, color, extra = {}) => ({ kind: 'mesh', ...solid, color, ...extra });
  const cable = (points, color, width, extra = {}) => ({ kind: 'cable', points, color, width, ...extra });

  /* 01 · twin hulls ----------------------------------------------------- */
  // Deep box pontoons: silver upper band, charcoal lower band tapering to a narrow keel,
  // raked ends, three sections, dark edge trims and square vents.
  const HW = .38, BAND = .42, KEEL = .22, DEPTH = .85, XE = 3.0, XB = 2.86, XK = 2.4, SEG = 1.75;
  const up = [[-HW, 0], [HW, 0], [HW, -BAND], [-HW, -BAND]];
  const low = [[-HW, -BAND], [HW, -BAND], [KEEL, -DEPTH], [-KEEL, -DEPTH]];
  const ring = (x, yc, pts) => pts.map(([y, z]) => [x, yc + y, z]);
  const endRing = (sign, yc, pts, xTop, xBottom, zTop) => pts.map(([y, z]) => [sign * (z >= zTop - 1e-6 ? xTop : xBottom), yc + y, z]);
  for (const [side, yc] of [['port', 1.0], ['starboard', -1.0]]) {
    const s = Math.sign(yc), out = yc + s * (HW + .003);
    // mid section
    const mid = mesh(loft([ring(-SEG, yc, up), ring(SEG, yc, up)]), C.hull);
    if (side === 'port') mid.decals = [
      { href: './assets/film-v3/esmi-logo.svg', p0: [.95, out, -.03], p1: [-.35, out, -.03], p3: [.95, out, -.4] },
      { href: TAGLINE, size: [640, 40], p0: [.5, out, -.355], p1: [-.35, out, -.355], p3: [.5, out, -.41] },
    ];
    const vents = (side === 'port' ? [-1.35, 1.25] : []).map(x => mesh(box(x, out + s * .006, -.2, .13, .012, .13), C.vent));
    const near = side === 'port' ? 4 : 0; // the near hull hides the systems bay
    part(0, `${side}-upper-1`, [mid, ...vents], { explode: [0, s * .55, .35], guide: true, layer: near });
    part(0, `${side}-lower-1`, [mesh(loft([ring(-SEG, yc, low), ring(SEG, yc, low)]), C.hullLow)], { explode: [0, s * .62, -.45], delay: .1, layer: near });
    for (const e of [1, -1]) {
      const tag = e > 0 ? 'bow' : 'stern';
      const inner = e * SEG;
      const upperEnd = endRing(e, yc, up, XE, XB, 0), lowerEnd = endRing(e, yc, low, XB, XK, -BAND);
      const endVents = side === 'port' && e < 0 ? [mesh(box(-2.45, out + s * .006, -.2, .13, .012, .13), C.vent)] : [];
      part(0, `${side}-${tag}-upper`, [mesh(loft(e > 0 ? [ring(inner, yc, up), upperEnd] : [upperEnd, ring(inner, yc, up)]), C.hull), ...endVents], { explode: [e * 1.0, s * .55, .35], layer: near });
      part(0, `${side}-${tag}-lower`, [mesh(loft(e > 0 ? [ring(inner, yc, low), lowerEnd] : [lowerEnd, ring(inner, yc, low)]), C.hullLow)], { explode: [e * 1.1, s * .62, -.45], delay: .1, layer: near });
    }
    // Dark trims: top edges, section seams and end corners.
    const trims = [mesh(box(0, yc + HW, .005, 2 * XE - .04, .045, .045), C.trim), mesh(box(0, yc - HW, .005, 2 * XE - .04, .045, .045), C.trim)];
    for (const x of [-SEG, SEG]) trims.push(mesh(box(x, out, -.21, .035, .02, .42), C.trim));
    for (const e of [1, -1]) trims.push(mesh(sq([e * XE, yc + s * HW, 0], [e * XB, yc + s * HW, -BAND], .04), C.trim));
    part(0, `${side}-trims`, trims, { explode: [0, s * 1.05, .6], delay: .3, layer: near + .1 });
  }
  [-2.5, -1.25, 0, 1.25, 2.5].forEach((x, i) => part(0, `crossbeam-${i}`, [mesh(box(x, 0, -.09, .12, 1.24, .08), C.beam), mesh(box(x, .64, -.09, .16, .06, .14), C.trim), mesh(box(x, -.64, -.09, .16, .06, .14), C.trim)], { explode: [0, 0, .7 + i * .05], delay: .35 + i * .06, guide: true, layer: 1 }));

  /* 02 · electric drive (outboard, illustrative) ------------------------- */
  part(1, 'transom-bracket', [mesh(box(-2.93, 0, -.06, .06, .42, .24), C.motorMid), mesh(box(-3.0, 0, .02, .1, .3, .06), C.motorMid)], { explode: [-.8, 0, .9], layer: 3 });
  part(1, 'outboard-cowling', [mesh(hexa([[-3.36, -.17, .02], [-3.02, -.17, .02], [-3.02, .17, .02], [-3.36, .17, .02], [-3.33, -.14, .36], [-3.06, -.14, .38], [-3.06, .14, .38], [-3.33, .14, .36]]), C.motor),
    mesh(box(-3.19, 0, .17, .3, .345, .05), C.motorMid), mesh(box(-3.04, .1, .26, .02, .06, .04), C.orange)], { explode: [-1.3, 0, 1.2], rot: { axis: 2, angle: 1.2 }, layer: 3, guide: true });
  part(1, 'outboard-leg', [mesh(hexa([[-3.27, -.05, -.82], [-3.13, -.05, -.82], [-3.13, .05, -.82], [-3.27, .05, -.82], [-3.29, -.08, .02], [-3.09, -.08, .02], [-3.09, .08, .02], [-3.29, .08, .02]]), C.motor), mesh(box(-3.22, 0, -.72, .34, .26, .02), C.motorMid)], { explode: [-1.4, 0, .25], layer: 3 });
  part(1, 'outboard-pod', [mesh(tube([-3.0, 0, -.88], [-3.38, 0, -.88], .07, 12), C.motor), mesh(hexa([[-3.08, -.012, -.92], [-3.3, -.012, -.92], [-3.3, .012, -.92], [-3.08, .012, -.92], [-3.12, -.012, -1.04], [-3.28, -.012, -1.0], [-3.28, .012, -1.0], [-3.12, .012, -1.04]]), C.motorMid)], { explode: [-1.6, 0, -.1], layer: 3 });
  const prop = [mesh(tube([-3.38, 0, -.88], [-3.47, 0, -.88], .045, 10), C.prop)];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * TAU, b = a + .5, r0 = .04, r1 = .19;
    const pt = (x, ang, r) => [x, Math.cos(ang) * r, -.88 + Math.sin(ang) * r];
    prop.push(mesh(hexa([pt(-3.41, a, r0), pt(-3.44, a, r1), pt(-3.44, b, r1), pt(-3.41, b, r0), pt(-3.43, a, r0), pt(-3.46, a, r1), pt(-3.46, b, r1), pt(-3.43, b, r0)]), C.prop));
  }
  part(1, 'propeller', prop, { explode: [-2.2, 0, -.05], spin: { axis: 0, turns: 3 }, layer: 3, guide: true });

  /* 03 · battery pack (under the deck, illustrative) --------------------- */
  const BZ = -.44;
  part(2, 'battery-tray', [mesh(box(-1.2, 0, -.545, 2.05, 1.06, .03), C.tray), mesh(box(-1.2, .54, -.5, 2.05, .02, .08), C.tray), mesh(box(-1.2, -.54, -.5, 2.05, .02, .08), C.tray)], { explode: [0, 0, .8], layer: 3, guide: true });
  let m = 0;
  for (const x of [-1.95, -1.45, -.95, -.45]) for (const y of [.26, -.26]) {
    const prims = [mesh(box(x, y, BZ, .44, .44, .18), C.battery), mesh(box(x, y, BZ + .093, .38, .38, .006), C.batteryTop),
      mesh(tube([x - .12, y, BZ + .09], [x - .12, y, BZ + .13], .022, 8), C.red), mesh(tube([x + .12, y, BZ + .09], [x + .12, y, BZ + .13], .022, 8), C.black)];
    part(2, `battery-module-${m}`, prims, { explode: [.25 - m * .05, (m % 2 ? -.25 : .25), 1.0 + m * .05], rot: { axis: 2, angle: .5 + m * .05 }, delay: .1 + m * .075, span: .3, layer: 3, guide: m % 2 === 0 });
    m++;
  }
  [-1.7, -1.2, -.7].forEach((x, i) => part(2, `busbar-${i}`, [mesh(box(x, .26, BZ + .135, .32, .05, .012), C.copper), mesh(box(x, -.26, BZ + .135, .32, .05, .012), C.copper)], { explode: [0, 0, .9], delay: .78 + i * .05, span: .15, layer: 3.2 }));
  part(2, 'bms', [mesh(box(-.05, .3, -.47, .24, .2, .1), C.green), mesh(box(-.05, .3, -.416, .2, .16, .008), '#7fb08a')], { explode: [.6, .3, 1.2], delay: .7, layer: 3 });

  /* 04 · electrical system ---------------------------------------------- */
  const ctrl = [mesh(box(-2.5, -.3, -.45, .34, .3, .14), C.controller)];
  for (let i = 0; i < 6; i++) ctrl.push(mesh(box(-2.5, -.42 + i * .048, -.36, .3, .012, .045), C.fins));
  part(3, 'motor-controller', ctrl, { explode: [-.45, -.25, 1.45], rot: { axis: 2, angle: -.8 }, layer: 3, guide: true });
  part(3, 'distribution-box', [mesh(box(-2.5, .32, -.46, .28, .24, .12), '#9aa0a7'), mesh(tube([-2.5, .32, -.4], [-2.5, .32, -.34], .04, 10), C.red), mesh(box(-2.5, .32, -.33, .1, .02, .02), C.red)], { explode: [-.45, .25, 1.45], rot: { axis: 2, angle: .7 }, layer: 3, delay: .08 });
  part(3, 'solar-charger', [mesh(box(.2, -.3, -.47, .24, .22, .1), '#3e5f7a'), mesh(box(.2, -.3, -.416, .18, .12, .008), '#88b4d4')], { explode: [.6, -.25, 1.45], rot: { axis: 2, angle: -.6 }, layer: 3, delay: .14 });
  const cables = [
    { pts: [[-2.12, .3, -.31], [-2.28, .32, -.34], [-2.36, .32, -.4]], c: C.red, w: 7 },
    { pts: [[-2.12, -.2, -.31], [-2.28, 0, -.34], [-2.38, .22, -.4]], c: C.black, w: 7 },
    { pts: [[-2.5, .2, -.4], [-2.52, .05, -.36], [-2.5, -.15, -.4]], c: C.orange, w: 6 },
    ...[-.06, 0, .06].map(d => ({ pts: [[-2.67, -.3 + d, -.42], [-2.85, -.15 + d, -.3], [-2.98, d, -.08], [-3.05, d, .1]], c: C.orange, w: 5 })),
    { pts: [[-2.32, -.42, -.42], [-1.0, -.52, -.28], [.9, -.52, -.2], [1.4, -.55, .05]], c: '#3d4247', w: 3.5 },
    { pts: [[.08, -.3, -.44], [-.2, -.27, -.36], [-.4, -.26, -.31]], c: C.red, w: 4 },
    { pts: [[.3, -.38, -.44], [.7, -.62, -.2], [.98, -.95, .02]], c: C.blue, w: 4 },
  ];
  cables.forEach((k, i) => part(3, `cable-${i}`, [cable(k.pts, k.c, k.w)], { draw: true, delay: .3 + i * .055, span: .4, layer: 3.5 }));

  /* 05 · deck ----------------------------------------------------------- */
  // A flush deck between the hulls: eight panels and dark end trims.
  let d = 0;
  const DX = [-2.85, -1.425, 0, 1.425, 2.85];
  for (let i = 0; i < 4; i++) for (const [y0, y1] of [[0, .62], [-.62, 0]]) {
    part(4, `deck-panel-${d}`, [mesh(box((DX[i] + DX[i + 1]) / 2, (y0 + y1) / 2, -.02, DX[i + 1] - DX[i] - .01, y1 - y0 - .01, .04), C.deck)],
      { explode: [0, (y0 + y1) * 1.2, 1.5 + d * .07], rot: { axis: 2, angle: (d % 2 ? -1 : 1) * .25 }, delay: d * .07, span: .35, layer: 6, guide: d % 3 === 0 });
    d++;
  }
  for (const e of [1, -1]) part(4, `deck-trim-${e > 0 ? 'bow' : 'stern'}`, [mesh(box(e * 2.86, 0, -.02, .04, 1.26, .05), C.deckTrim)], { explode: [e * 1.0, 0, .9], delay: .62, span: .25, layer: 6.2 });

  /* 06 · aluminium frame ------------------------------------------------ */
  // Perimeter rail with rounded corners on square posts and dark base plates.
  const RX0 = -2.35, RX1 = 1.98, RY = .95, RZ = .55, RR = .18;
  const railPost = (x, y) => [mesh(box(x, y, .012, .13, .13, .024), C.plate), mesh(sq([x, y, .024], [x, y, RZ - .03], .05), C.alu), mesh(box(x, y, RZ, .08, .08, .07), C.alu)];
  const posts = [[-2.12, 1], [-.9, 1], [.35, 1], [1.75, 1], [-2.12, -1], [-.9, -1], [.35, -1], [1.75, -1]];
  posts.forEach(([x, s], i) => part(5, `rail-post-${i}`, railPost(x, s * RY), { explode: [0, s * (1.1 + (i % 4) * .08), .7 + (i % 4) * .08], delay: .05 + (i % 4) * .045, span: .26, layer: 8 }));
  part(5, 'rail-post-stern', railPost(RX0, 0), { explode: [-1, 0, .8], delay: .2, span: .26, layer: 8 });
  const rt = (a, b) => mesh(tube(a, b, .028, 8), C.alu);
  for (const s of [1, -1]) part(5, `rail-side-${s > 0 ? 'p' : 's'}`, [rt([RX0 + RR, s * RY, RZ], [RX1 - RR, s * RY, RZ])], { explode: [0, s * 1.6, 1.4], delay: .32, span: .3, layer: 8.1, guide: true });
  part(5, 'rail-stern', [rt([RX0, -RY + RR, RZ], [RX0, RY - RR, RZ])], { explode: [-1.2, 0, 1.4], delay: .36, span: .3, layer: 8.1 });
  part(5, 'rail-bow', [rt([RX1, -RY + RR, RZ], [RX1, RY - RR, RZ])], { explode: [1.2, 0, 1.4], delay: .38, span: .3, layer: 8.1 });
  let ci = 0;
  for (const [cx, cy, a0] of [[RX1 - RR, RY - RR, 0], [RX0 + RR, RY - RR, Math.PI / 2], [RX0 + RR, -RY + RR, Math.PI], [RX1 - RR, -RY + RR, 1.5 * Math.PI]]) {
    const pts = Array.from({ length: 5 }, (_, k) => { const t = a0 + k / 4 * Math.PI / 2; return [cx + Math.cos(t) * RR, cy + Math.sin(t) * RR, RZ]; });
    part(5, `rail-corner-${ci}`, pts.slice(1).map((p, k) => rt(pts[k], p)), { explode: [Math.sign(cx) * .9, Math.sign(cy) * 1.2, 1.5], delay: .44 + ci * .03, span: .22, layer: 8.1 });
    ci++;
  }
  // Canopy uprights: square tubes with a dark knuckle and a Y-branch to the roof beams.
  const UY = 1.02, KZ = 1.72, TZ = 2.3;
  let fp = 0;
  for (const [bx, kx] of [[-1.75, -1.82], [1.0, 1.3]]) for (const s of [1, -1]) {
    const base = [bx, s * UY, 0], knee = [kx, s * UY, KZ];
    part(5, `upright-${fp}`, [mesh(box(bx, s * UY, .015, .16, .16, .03), C.plate), mesh(sq(base, knee, .075), C.alu), mesh(box(kx, s * UY, KZ, .12, .12, .12), C.knuckle),
      mesh(sq(knee, [kx - .55, s * UY, TZ], .06), C.alu), mesh(sq(knee, [kx + .55, s * UY, TZ], .06), C.alu)],
      { explode: [0, s * 1.2, 1.9 + fp * .05], rot: { axis: 0, angle: s * .3 }, delay: .5 + fp * .06, span: .3, layer: 8, guide: true });
    fp++;
  }
  const BX0 = -2.55, BX1 = 2.0;
  [[[BX0, UY, TZ + .035], [BX1, UY, TZ + .035], [0, .7, 1.0]], [[BX0, -UY, TZ + .035], [BX1, -UY, TZ + .035], [0, -.7, 1.0]]]
    .forEach(([a, b, e], i) => part(5, i ? 'roof-beam-s' : 'roof-frame', [mesh(sq(a, b, .07), C.alu), mesh(box(-1.82, a[1], TZ - .005, .14, .1, .05), C.knuckle), mesh(box(1.3, a[1], TZ - .005, .14, .1, .05), C.knuckle)], { explode: e, delay: .74 + i * .04, span: .24, layer: 9, guide: i === 0 }));
  [BX0, -1.82, -.3, 1.3, BX1].forEach((x, i) => part(5, `roof-bar-${i}`, [mesh(sq([x, -UY, TZ + .035], [x, UY, TZ + .035], .06), C.alu)], { explode: [0, 0, 1.2 + i * .05], rot: { axis: 2, angle: .5 }, delay: .8 + i * .03, span: .18, layer: 9 }));

  /* 07 · seats ---------------------------------------------------------- */
  // Bucket seats: black shell, light-grey cushions, black armrests, on dark box bases.
  const seat = (x, y) => {
    const hx = .25, hy = .25, SB = .34;
    const back0 = x - .22, back1 = x - .3;
    return [
      [mesh(box(x, y, SB / 2, .52, .52, SB), C.seatBase), mesh(box(x, y, SB + .01, .44, .44, .02), C.seatShell)],
      [mesh(box(x, y, SB + .06, 2 * hx, 2 * hy, .08), C.seatShell),
        mesh(hexa([[x - .2, y - .19, .44], [x + .21, y - .19, .44], [x + .21, y + .19, .44], [x - .2, y + .19, .44], [x - .2, y - .19, .5], [x + .21, y - .19, .515], [x + .21, y + .19, .515], [x - .2, y + .19, .5]]), C.seatPad)],
      [mesh(hexa([[back0 - .1, y - hy, .4], [back0, y - hy, .4], [back0, y + hy, .4], [back0 - .1, y + hy, .4], [back1 - .1, y - hy + .01, 1.02], [back1, y - hy + .01, 1.02], [back1, y + hy - .01, 1.02], [back1 - .1, y + hy - .01, 1.02]]), C.seatShell),
        mesh(hexa([[back0, y - .19, .52], [back0 + .03, y - .19, .52], [back0 + .03, y + .19, .52], [back0, y + .19, .52], [back1 + .005, y - .19, .97], [back1 + .035, y - .19, .97], [back1 + .035, y + .19, .97], [back1 + .005, y + .19, .97]]), C.seatPad)],
      [...[-1, 1].flatMap(o => [mesh(box(x - .01, y + o * (hy + .02), .66, .34, .05, .05), C.seatShell), mesh(sq([x + .13, y + o * (hy + .02), .64], [x + .07, y + o * (hy + .02), .44], .045), C.seatShell)])],
    ];
  };
  const seats = [[-.95, .45], [.45, -.5], [.4, .45], [-.95, -.45]];
  const lift = [[0, 0, 0], [0, 0, .35], [-.3, 0, .7], [0, 0, .5]];
  const seatPart = ['base', 'cushion', 'back', 'arms'];
  seats.forEach(([x, y], i) => seat(x, y).forEach((prims, k) => part(6, k === 0 ? `seat-${i}` : `seat-${i}-${seatPart[k]}`, prims, {
    explode: add(lift[k], [.12 * (i % 2 ? 1 : -1), y * (.9 + (k === 3 ? .4 : 0)), 1.6 + i * .06]), rot: { axis: 2, angle: (i % 2 ? 1 : -1) * .5 },
    delay: i * .12 + k * .04, span: .3, layer: 8 + k * .05, guide: k === 0 })));

  /* 08 · helm ----------------------------------------------------------- */
  const cx0 = 1.25, cx1 = 1.85, cy0 = -.85, cy1 = -.25, ch = 1.0, face = cy1 + .003;
  const consoleBody = mesh(box((cx0 + cx1) / 2, (cy0 + cy1) / 2, ch / 2, cx1 - cx0, cy1 - cy0, ch), C.console, { decals: [
    { href: './assets/film-v3/esmi-mark.svg', size: [144, 94], p0: [1.73, face, .86], p1: [1.37, face, .86], p3: [1.73, face, .625] },
    { href: WORD, size: [300, 90], p0: [1.78, face, .6], p1: [1.32, face, .6], p3: [1.78, face, .462] },
    { href: TAGLINE, size: [640, 40], p0: [1.78, face, .44], p1: [1.32, face, .44], p3: [1.78, face, .41] },
  ] });
  part(7, 'console', [consoleBody, mesh(box((cx0 + cx1) / 2, (cy0 + cy1) / 2, .01, cx1 - cx0 + .04, cy1 - cy0 + .04, .02), C.plate)], { explode: [1.3, -.4, 1.8], rot: { axis: 2, angle: -.6 }, layer: 8, guide: true });
  part(7, 'windscreen', [mesh(hexa([[1.6, -.83, ch], [1.64, -.83, ch], [1.64, -.27, ch], [1.6, -.27, ch], [1.66, -.76, ch + .42], [1.7, -.76, ch + .42], [1.7, -.34, ch + .42], [1.66, -.34, ch + .42]]), C.glass, { opacity: .78 })],
    { explode: [1.2, -.3, 2.6], rot: { axis: 1, angle: -.5 }, delay: .3, layer: 8.3 });
  const wc = [1.02, -.55, 1.06], wn = norm([-1, 0, .55]);
  const [wu, wv] = basis(wn);
  const wp = (a, r = .2) => add(wc, add(mul(wu, Math.cos(a) * r), mul(wv, Math.sin(a) * r)));
  const wheel = [];
  for (let i = 0; i < 20; i++) wheel.push(mesh(tube(wp(i / 20 * TAU), wp((i + 1.08) / 20 * TAU), .022, 6), C.wheel));
  for (let i = 0; i < 3; i++) wheel.push(mesh(tube(wc, wp(i / 3 * TAU + .5), .016, 5), C.wheel));
  wheel.push(mesh(tube(add(wc, mul(wn, .03)), add(wc, mul(wn, -.05)), .05, 10), C.wheel));
  part(7, 'steering-wheel', wheel, { explode: [-.5, -.3, 1.9], spin: { axis: wn, center: wc, turns: 1.2 }, delay: .5, layer: 8.5, guide: true });
  part(7, 'helm-column', [mesh(sq([cx0, -.55, .8], add(wc, mul(wn, -.05)), .07), C.wheel), mesh(box(cx0 - .01, -.55, .78, .04, .2, .14), C.wheel), mesh(tube([cx0 - .02, -.32, .9], [cx0 - .1, -.32, 1.0], .012, 6), C.wheel), mesh(tube([cx0 - .1, -.34, 1.0], [cx0 - .1, -.3, 1.0], .022, 8), C.red)],
    { explode: [-.4, -.2, 1.5], delay: .38, layer: 8.4 });

  /* 09 · solar canopy -------------------------------------------------- */
  const SZ = 2.4, SX0 = -2.95, SX1 = 2.35, SY = 1.5;
  [[box((SX0 + SX1) / 2, SY, SZ, SX1 - SX0, .07, .08), [0, .9, 1.4]], [box((SX0 + SX1) / 2, -SY, SZ, SX1 - SX0, .07, .08), [0, -.9, 1.4]], [box(SX0, 0, SZ, .07, 2 * SY, .08), [-.9, 0, 1.4]], [box(SX1, 0, SZ, .07, 2 * SY, .08), [.9, 0, 1.4]]]
    .forEach(([solid, e], i) => part(8, i ? `canopy-edge-${i}` : 'canopy-edge', [mesh(solid, C.solarEdge), ...(i < 2 ? [mesh(box(SX0, solid.verts[0][1] > 0 ? SY : -SY, SZ, .1, .1, .09), C.knuckle), mesh(box(SX1, solid.verts[0][1] > 0 ? SY : -SY, SZ, .1, .1, .09), C.knuckle)] : [])], { explode: e, delay: i * .03, span: .2, layer: 10, guide: i === 0 }));
  const cols = 4, rows = 3, px = (SX1 - SX0) / cols, py = 2 * SY / rows;
  let sp = 0;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x0 = SX0 + i * px + .04, x1 = x0 + px - .05, y0 = -SY + j * py + .04, y1 = y0 + py - .05, top = SZ + .025;
    const panel = mesh(box((x0 + x1) / 2, (y0 + y1) / 2, SZ, x1 - x0, y1 - y0, .05), C.solar, {
      decals: [{ fill: 'url(#esmi-cells)', p0: [x1, y0, top + .001], p1: [x1, y1, top + .001], p3: [x0, y0, top + .001] },
        { fill: 'url(#esmi-glint)', glint: true, p0: [x1, y0, top + .002], p1: [x1, y1, top + .002], p3: [x0, y0, top + .002] }] });
    part(8, `solar-module-${sp}`, [panel], { explode: [(i - 1.5) * .45, (j - 1) * .7, 1.9 + sp * .03], rot: { axis: 2, angle: (sp % 2 ? -1 : 1) * .45 }, delay: .15 + sp * .055, span: .26, layer: 10.5, guide: sp % 3 === 1 });
    sp++;
  }

  // Stack the exploded view in readable tiers: hulls low, systems, deck, cabin, roof, sun.
  const tiers = [null, 1.0, 1.1, 1.25, 1.75, 2.55, 2.6, 2.75, 4.4];
  const byChapter = {};
  for (const p of parts) (byChapter[p.chapter] ||= []).push(p);
  for (const [chapter, list] of Object.entries(byChapter)) {
    const tier = tiers[chapter];
    if (tier == null) continue;
    const mean = list.reduce((acc, p) => acc + p.explode[2], 0) / list.length;
    for (const p of list) {
      if (p.draw) continue;
      const pts = p.prims.flatMap(q => q.kind === 'cable' ? q.points : q.verts);
      const pivot = mul(pts.reduce(add), 1 / pts.length);
      const roof = Number(chapter) === 5 && pivot[2] > 1.6;
      const target = (roof ? 3.6 : tier) + (p.explode[2] - mean) * .25;
      p.explode = [p.explode[0], p.explode[1], Math.max(p.explode[2] * .2, target - pivot[2])];
    }
  }
  return parts;
}

/* ---------- chapters (assembly progress windows) ---------- */
export const DEFAULT_WINDOWS = [[0, .12], [.12, .22], [.22, .32], [.32, .42], [.42, .53], [.53, .63], [.63, .73], [.73, .83], [.83, .94]];
const LABELS = [
  [['port-upper-1', 'Port hull'], ['starboard-upper-1', 'Starboard hull'], ['crossbeam-2', 'Cross beams']],
  [['outboard-cowling', 'Electric outboard'], ['propeller', 'Propeller'], ['transom-bracket', 'Transom mount']],
  [['battery-module-0', 'Battery modules ×8'], ['battery-tray', 'Battery tray'], ['bms', 'Battery management']],
  [['motor-controller', 'Motor controller'], ['distribution-box', 'Power distribution'], ['solar-charger', 'Solar charge controller']],
  [['deck-panel-0', 'Deck panels ×8'], ['deck-trim-bow', 'Deck trim', [140, 90]]],
  [['upright-0', 'Aluminum uprights'], ['rail-side-p', 'Perimeter rail'], ['roof-frame', 'Roof frame']],
  [['seat-2', 'Passenger seats ×3'], ['seat-1', 'Helm seat']],
  [['steering-wheel', 'Steering wheel'], ['windscreen', 'Windscreen'], ['console', 'ESMI console']],
  [['solar-module-0', 'Solar modules ×12'], ['canopy-edge', 'Canopy frame']],
];
const LABEL_OFFSETS = [[-170, -90], [-150, 80], [150, -110]];

/* ---------- renderer ---------- */
export class ExplodedBoat {
  constructor(container, { windows = DEFAULT_WINDOWS, labels = true } = {}) {
    this.container = container;
    this.parts = buildModel();
    this.setWindows(windows);
    this.value = 0; this.target = 0; this.time = 0;
    this.reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.build(labels);
    this.fit();
  }
  setWindows(windows) {
    this.windows = windows;
    const byChapter = new Map();
    for (const p of this.parts) { if (!byChapter.has(p.chapter)) byChapter.set(p.chapter, []); byChapter.get(p.chapter).push(p); }
    for (const [chapter, list] of byChapter) {
      const [w0, w1] = windows[chapter] || DEFAULT_WINDOWS[chapter];
      list.forEach((p, i) => {
        const delay = p.delay ?? (list.length > 1 ? i / (list.length - 1) * .55 : 0);
        const span = p.span ?? .45;
        p.start = w0 + (w1 - w0) * clamp(delay, 0, 1 - span);
        p.end = p.start + (w1 - w0) * span;
      });
    }
  }
  build(withLabels) {
    const svg = this.svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('class', 'esmi-exploded-svg');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = `<defs>
      <pattern id="esmi-cells" patternUnits="userSpaceOnUse" width=".125" height=".1666667"><rect width=".125" height=".1666667" fill="#203369"/><rect x=".006" y=".009" width=".113" height=".149" fill="#1b2b5d"/><rect x=".0615" y="0" width=".002" height=".1666667" fill="#4d64a8" opacity=".55"/></pattern>
      <linearGradient id="esmi-glint" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
      <filter id="esmi-soft" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="18"/></filter>
    </defs>`;
    this.glint = svg.querySelector('#esmi-glint');
    this.shadow = document.createElementNS(NS, 'path');
    this.shadow.setAttribute('fill', '#20303a'); this.shadow.setAttribute('filter', 'url(#esmi-soft)');
    svg.appendChild(this.shadow);
    this.guides = document.createElementNS(NS, 'g'); this.guides.setAttribute('class', 'esmi-guides');
    svg.appendChild(this.guides);
    this.world = document.createElementNS(NS, 'g'); svg.appendChild(this.world);
    this.fx = document.createElementNS(NS, 'g'); this.fx.setAttribute('class', 'esmi-fx'); svg.appendChild(this.fx);
    this.prims = [];
    for (const p of this.parts) {
      p.pivot = this.centroidOf(p.prims);
      if (p.guide) {
        p.guideEl = document.createElementNS(NS, 'path');
        this.guides.appendChild(p.guideEl);
      }
      p.pulseEl = document.createElementNS(NS, 'circle');
      this.fx.appendChild(p.pulseEl);
      for (const prim of p.prims) {
        const g = document.createElementNS(NS, 'g');
        prim.part = p; prim.g = g;
        prim.centroid = prim.kind === 'cable' ? mul(prim.points.reduce(add), 1 / prim.points.length) : mul(prim.verts.reduce(add), 1 / prim.verts.length);
        prim.rgb = hex(prim.color);
        if (prim.kind === 'cable') {
          prim.under = document.createElementNS(NS, 'path'); prim.over = document.createElementNS(NS, 'path');
          for (const el of [prim.under, prim.over]) { el.setAttribute('fill', 'none'); el.setAttribute('stroke-linecap', 'round'); el.setAttribute('stroke-linejoin', 'round'); g.appendChild(el); }
          prim.under.setAttribute('stroke', shade(prim.rgb, .55));
          prim.over.setAttribute('stroke', prim.color);
        } else {
          prim.paths = prim.faces.map(() => { const el = document.createElementNS(NS, 'path'); g.appendChild(el); return el; });
          if (prim.opacity) g.setAttribute('opacity', prim.opacity);
          prim.decalEls = (prim.decals || []).map(dc => {
            let el;
            dc.w = dc.size ? dc.size[0] : dc.href ? 487 : 1; dc.h = dc.size ? dc.size[1] : dc.href ? 147 : 1;
            if (dc.href) { el = document.createElementNS(NS, 'image'); el.setAttribute('href', dc.href); el.setAttribute('preserveAspectRatio', 'none'); }
            else { el = document.createElementNS(NS, 'rect'); el.setAttribute('fill', dc.fill); }
            el.setAttribute('width', dc.w); el.setAttribute('height', dc.h);
            g.appendChild(el); return el;
          });
        }
        this.world.appendChild(g);
        this.prims.push(prim);
      }
    }
    this.order = this.prims.slice();
    this.container.appendChild(svg);
    if (withLabels) {
      this.labelLayer = document.createElement('div');
      this.labelLayer.className = 'esmi-callouts';
      this.labelLayer.setAttribute('aria-hidden', 'true');
      this.labelEls = LABELS.map(list => list.map(([id, text, offset], i) => {
        const el = document.createElement('div');
        el.className = 'esmi-callout';
        el.innerHTML = `<i></i><svg><line/></svg><span>${text}</span>`;
        this.labelLayer.appendChild(el);
        return { el, part: this.parts.find(p => p.id === id), offset: offset || LABEL_OFFSETS[i] };
      }));
      this.container.appendChild(this.labelLayer);
    }
  }
  centroidOf(prims) {
    const pts = prims.flatMap(p => p.kind === 'cable' ? p.points : p.verts);
    return mul(pts.reduce(add), 1 / pts.length);
  }
  camera(a) {
    const e = easeInOut(a);
    const az = lerp(60, 50, e) * Math.PI / 180, el = lerp(27, 19, e) * Math.PI / 180;
    const toCam = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
    const right = norm([-Math.sin(az), Math.cos(az), 0]);
    return { toCam, right, up: cross(toCam, right) };
  }
  // Part pose at assembly progress a.
  pose(p, a, time) {
    const t = clamp((a - p.start) / (p.end - p.start));
    const k = p.draw ? 1 : easeBack(t);
    let off = mul(p.explode, 1 - k);
    if (!this.reduced && t < 1 && !p.draw) {
      const amp = .035 * (1 - smooth(t * 1.4));
      off = add(off, [0, 0, Math.sin(time * 1.3 + p.pivot[0] * 1.7 + p.pivot[1] * 2.3) * amp]);
    }
    const rots = [];
    if (p.rot) rots.push({ axis: p.rot.axis, angle: p.rot.angle * (1 - easeOut(t)), center: p.pivot });
    if (p.spin) rots.push({ axis: p.spin.axis, angle: p.spin.turns * TAU * (1 - easeOut(t)), center: p.spin.center || p.pivot });
    return { t, off, rots };
  }
  transform(v, pose) {
    let q = v;
    for (const r of pose.rots) q = rotate(q, r.axis, r.angle, r.center);
    return add(q, pose.off);
  }
  fit() {
    // Fit the assembled boat to the photographic handoff, and the exploded view to the stage.
    const box = (a, cam) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of this.parts) {
        const pose = this.pose(p, a, 0);
        for (const prim of p.prims) for (const v of prim.kind === 'cable' ? prim.points : prim.verts) {
          const w = this.transform(v, pose); const x = dot(w, cam.right), y = -dot(w, cam.up);
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      return { x0, x1, y0, y1 };
    };
    const solve = (a, fw, fh, cx, cy) => {
      const b = box(a, this.camera(a));
      const s = Math.min(W * fw / (b.x1 - b.x0), H * fh / (b.y1 - b.y0));
      return { s, ox: W * cx - (b.x0 + b.x1) / 2 * s, oy: H * cy - (b.y0 + b.y1) / 2 * s };
    };
    this.fitEnd = solve(1, .585, .75, .512, .535);
    this.fitStart = solve(0, .8, .86, .47, .5);
  }
  // Frame the current arrangement: wide for the exploded view, matching the photograph when assembled.
  frameFor(a, cam, poses) {
    // Frame everything while exploded; then follow the parts already in play,
    // letting parts that are still waiting drift in from beyond the frame.
    const bounds = all => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const prim of this.prims) {
        const p = prim.part;
        if (!all && poses.get(p).t <= 0 && p.chapter !== 0) continue;
        for (const w of prim.tv) {
          const x = dot(w, cam.right), y = -dot(w, cam.up);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return [x0, x1, y0, y1];
    };
    const k = .5 * smooth(a / .16);
    const A = bounds(true), B = k > 0 ? bounds(false) : A;
    const [x0, x1, y0, y1] = A.map((v, i) => lerp(v, B[i], k));
    const f = easeInOut(clamp(a / .94));
    const fw = lerp(.88, .64, f), fh = lerp(.9, .76, f), cx = lerp(.47, .5, f), cy = lerp(.5, .54, f);
    const s = Math.min(W * fw / (x1 - x0), H * fh / (y1 - y0), this.fitEnd.s * 1.02);
    const ox = W * cx - (x0 + x1) / 2 * s, oy = H * cy - (y0 + y1) / 2 * s;
    const e = this.fitEnd, m = smooth((a - .82) / .14);
    return { s: lerp(s, e.s, m), ox: lerp(ox, e.ox, m), oy: lerp(oy, e.oy, m) };
  }
  setProgress(a) { this.target = clamp(a); }
  step(time, snap = false) {
    this.time = time;
    const diff = this.target - this.value;
    this.value = snap || this.reduced || Math.abs(diff) < 1e-4 ? this.target : this.value + diff * .16;
    this.render(this.value, time);
    return Math.abs(this.target - this.value) > 1e-4 || (!this.reduced && this.value < .995);
  }
  render(a, time = 0) {
    const cam = this.camera(a);
    const f = easeInOut(clamp(a / .94));
    const poses = new Map(this.parts.map(p => [p, this.pose(p, a, time)]));
    for (const prim of this.prims) { const pose = poses.get(prim.part); prim.tv = (prim.kind === 'cable' ? prim.points : prim.verts).map(v => this.transform(v, pose)); }
    const fr = this.frameFor(a, cam, poses);
    const s = fr.s, ox = fr.ox, oy = fr.oy;
    const proj = w => [dot(w, cam.right) * s + ox, -dot(w, cam.up) * s + oy];
    const light = norm(add(add(mul(cam.toCam, .55), [0, 0, .9]), mul(cam.right, -.45)));
    const half = norm(add(light, cam.toCam));
    const P = n => n.toFixed(1);
    // Ground shadow under the hulls, softening as the boat comes together.
    const sh = [[-2.9, 1.3], [2.95, 1.3], [2.95, -1.3], [-2.9, -1.3]].map(([x, y]) => proj([x, y, -.66]));
    this.shadow.setAttribute('d', `M${sh.map(p => p.map(P).join(' ')).join('L')}Z`);
    this.shadow.setAttribute('opacity', (.1 + .12 * smooth(a)).toFixed(3));
    for (const prim of this.prims) {
      const p = prim.part, pose = poses.get(p);
      const c = this.transform(prim.centroid, pose);
      const bias = (p.layer || 0) * smooth((pose.t - .55) / .45);
      prim.key = dot(c, cam.toCam) + bias;
      if (prim.kind === 'cable') {
        const pts = prim.tv.map(proj);
        let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        const d = `M${pts.map(q => q.map(P).join(' ')).join('L')}`;
        const drawn = easeInOut(pose.t);
        const w = prim.width * s / 300;
        for (const [el, width] of [[prim.under, w + 2], [prim.over, w]]) {
          el.setAttribute('d', d); el.setAttribute('stroke-width', width.toFixed(2));
          el.setAttribute('stroke-dasharray', `${len.toFixed(1)} ${(len + 10).toFixed(1)}`);
          el.setAttribute('stroke-dashoffset', (len * (1 - drawn)).toFixed(1));
        }
        prim.g.style.display = drawn > .001 ? '' : 'none';
        continue;
      }
      const tv = prim.tv;
      const tc = mul(tv.reduce(add), 1 / tv.length);
      const sv = tv.map(proj);
      prim.faces.forEach((face, i) => {
        const el = prim.paths[i];
        const a0 = tv[face[0]];
        let n = [0, 0, 0];
        for (let j = 1; j < face.length - 1; j++) n = add(n, cross(sub(tv[face[j]], a0), sub(tv[face[j + 1]], a0)));
        if (Math.hypot(...n) < 1e-9) { el.setAttribute('d', ''); return; }
        n = norm(n);
        const fc = mul(face.reduce((acc, k) => add(acc, tv[k]), [0, 0, 0]), 1 / face.length);
        if (dot(n, sub(fc, tc)) < 0) n = mul(n, -1);
        if (dot(n, cam.toCam) <= 0.002) { el.setAttribute('d', ''); return; }
        const diffuse = Math.max(0, dot(n, light));
        const spec = Math.pow(Math.max(0, dot(n, half)), 28) * .35;
        const level = .58 + .5 * diffuse + .05 * n[2];
        el.setAttribute('d', `M${face.map(k => sv[k].map(P).join(' ')).join('L')}Z`);
        const col = prim.rgb.map(ch => clamp(Math.round(ch * level + 255 * spec), 0, 255));
        el.setAttribute('fill', `rgb(${col})`);
        el.setAttribute('stroke', `rgb(${col.map(ch => Math.round(ch * .78))})`);
        el.setAttribute('stroke-width', '.7');
        el.setAttribute('stroke-linejoin', 'round');
      });
      prim.decalEls.forEach((el, i) => {
        const dc = prim.decals[i];
        const p0 = this.transform(dc.p0, pose), p1 = this.transform(dc.p1, pose), p3 = this.transform(dc.p3, pose);
        let nrm = norm(cross(sub(p1, p0), sub(p3, p0)));
        const mid = mul(add(p1, p3), .5);
        if (dot(nrm, sub(mid, tc)) < 0) nrm = mul(nrm, -1);
        if (dot(nrm, cam.toCam) < .05) { el.style.display = 'none'; return; }
        const [a0, a1, a3] = [proj(p0), proj(p1), proj(p3)];
        el.style.display = '';
        el.setAttribute('transform', `matrix(${[(a1[0] - a0[0]) / dc.w, (a1[1] - a0[1]) / dc.w, (a3[0] - a0[0]) / dc.h, (a3[1] - a0[1]) / dc.h, a0[0], a0[1]].map(v => v.toFixed(4))})`);
      });
    }
    // Painter's order: farthest first; assembled layers sit above what they cover.
    this.order.sort((x, y) => x.key - y.key);
    let node = this.world.firstChild;
    for (const prim of this.order) {
      if (prim.g !== node) this.world.insertBefore(prim.g, node);
      else node = node.nextSibling;
    }
    // Solar glint sweeps once the panels are home.
    const g = clamp((a - .9) / .06);
    const gx = lerp(-1.2, 1.4, easeInOut(g));
    this.glint.setAttribute('x1', gx.toFixed(3)); this.glint.setAttribute('x2', (gx + .8).toFixed(3));
    this.glint.setAttribute('gradientTransform', '');
    this.svg.style.setProperty('--glint', g > 0 && g < 1 ? '1' : '0');
    // Guides (exploded-view dash lines) and landing pulses.
    for (const p of this.parts) {
      const pose = poses.get(p);
      if (p.guideEl) {
        const from = proj(this.transform(p.pivot, pose)), to = proj(p.pivot);
        const op = pose.t >= 1 ? 0 : .5 * (1 - smooth(pose.t * 1.2));
        if (op < .01 || Math.hypot(from[0] - to[0], from[1] - to[1]) < 4) p.guideEl.setAttribute('d', '');
        else { p.guideEl.setAttribute('d', `M${from.map(P).join(' ')}L${to.map(P).join(' ')}`); p.guideEl.setAttribute('opacity', op.toFixed(3)); }
      }
      const u = (a - p.end) / .022;
      if (u > 0 && u < 1 && p.guide) {
        const c = proj(p.pivot);
        p.pulseEl.setAttribute('cx', P(c[0])); p.pulseEl.setAttribute('cy', P(c[1]));
        p.pulseEl.setAttribute('r', P((6 + 30 * easeOut(u)) * s / 160));
        p.pulseEl.setAttribute('opacity', (.55 * (1 - u)).toFixed(3));
      } else p.pulseEl.setAttribute('opacity', '0');
    }
    this.project = proj; this.poses = poses; this.a = a;
  }
  // Callouts are HTML so they stay legible at any stage size.
  placeLabels(rect, chapter, local) {
    if (!this.labelEls) return;
    const scale = rect.width / W;
    this.labelEls.forEach((list, c) => list.forEach(({ el, part, offset }, i) => {
      const show = c === chapter ? smooth((local - .08 - i * .06) / .18) * (1 - smooth((local - .9) / .1)) : 0;
      el.style.opacity = show.toFixed(3);
      if (show <= 0 || !this.project) return;
      const pose = this.poses.get(part);
      const [x, y] = this.project(this.transform(part.pivot, pose));
      const k = clamp(rect.width / 1100, .45, 1), ox = offset[0] * k, oy = offset[1] * k;
      el.style.transform = `translate(${(rect.x + x * scale).toFixed(1)}px,${(rect.y + y * scale).toFixed(1)}px)`;
      el.style.setProperty('--dx', `${ox}px`); el.style.setProperty('--dy', `${oy}px`);
      const line = el.querySelector('line');
      line.setAttribute('x1', 0); line.setAttribute('y1', 0); line.setAttribute('x2', ox * show); line.setAttribute('y2', oy * show);
      el.classList.toggle('to-left', ox < 0);
    }));
  }
}

function rotate(v, axis, angle, c) {
  if (!angle) return v;
  const p = sub(v, c);
  const k = typeof axis === 'number' ? [axis === 0 ? 1 : 0, axis === 1 ? 1 : 0, axis === 2 ? 1 : 0] : axis;
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const r = add(add(mul(p, cos), mul(cross(k, p), sin)), mul(k, dot(k, p) * (1 - cos)));
  return add(r, c);
}
function shade(rgb, f) { return `rgb(${rgb.map(c => Math.round(c * f))})`; }

/* ---------- website integration ---------- */
// Chapter order used by the story navigation (matches assets/v2/assembly.json).
const NAV = ['Hull', 'Drive', 'Battery', 'Wiring', 'Deck', 'Frame', 'Seating', 'Helm', 'Solar'];

async function readWindows() {
  try {
    const config = JSON.parse(document.querySelector('#experience-config')?.textContent || '{}');
    const response = await fetch(config.manifest || './assets/v2/assembly.json');
    const data = await response.json();
    if (!data.svgAssembly || !Array.isArray(data.chapters)) return null;
    const windows = DEFAULT_WINDOWS.map(w => [...w]);
    data.chapters.forEach((chapter, i) => {
      const index = NAV.indexOf(chapter.nav);
      if (index >= 0) windows[index] = [Number(chapter.start ?? i / data.chapters.length), Math.min(.94, Number(chapter.end ?? (i + 1) / data.chapters.length))];
    });
    return windows;
  } catch { return null; }
}

function studioRect(width, height, assembly) {
  // Same framing as timeline.js mediaRect(): the SVG and the photographic handoff share one rectangle.
  const scale = Math.min(width / 16, height / 9);
  const w = 16 * scale, h = w * 9 / 16;
  const centerY = width <= 760 ? height * .43 : height * .5;
  const settle = clamp((assembly - .9) / .1);
  const studioScale = width > 760 ? .82 + .18 * smooth(settle) : 1;
  return { x: (width - w) / 2, y: centerY - h * studioScale / 2, width: w * studioScale, height: h * studioScale };
}

async function mount() {
  const stage = document.querySelector('#stage');
  const media = document.querySelector('#media-stage');
  if (!stage || !media) return;
  const windows = await readWindows();
  if (!windows) return;
  const layer = document.createElement('div');
  layer.className = 'esmi-exploded';
  layer.setAttribute('aria-hidden', 'true');
  media.appendChild(layer);
  const boat = new ExplodedBoat(layer, { windows });
  document.documentElement.classList.add('has-svg-assembly');
  let raf = 0, onscreen = true;
  const place = () => {
    const a = Number(stage.dataset.assembly || 0);
    const rect = studioRect(stage.clientWidth, stage.clientHeight, a);
    Object.assign(boat.svg.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    let chapter = 0;
    windows.forEach((w, i) => { if (boat.value >= w[0]) chapter = i; });
    const [w0, w1] = windows[chapter];
    boat.placeLabels(rect, stage.dataset.phase === 'intro' ? -1 : chapter, (boat.value - w0) / Math.max(1e-6, w1 - w0));
  };
  let last = 0;
  const show = fade => {
    layer.style.opacity = fade.toFixed(3);
    layer.style.visibility = fade <= 0 ? 'hidden' : 'visible';
  };
  const tick = now => {
    raf = 0;
    const a = Number(stage.dataset.assembly || 0);
    boat.setProgress(a);
    if (stage.dataset.phase === 'film') {
      // The film owns the stage; keep the model in step so it reappears in place.
      boat.value = a;
      show(0);
      return;
    }
    // Idle drift of the exploded parts runs at ~30 fps; scrolling renders every frame.
    if (Math.abs(a - boat.value) < 1e-4 && now - last < 32) { if (onscreen && !document.hidden) raf = requestAnimationFrame(tick); return; }
    last = now;
    const more = boat.step(now / 1000);
    // Hand over to the photographed boat just before the film begins, and back again on the way up.
    show(1 - smooth((boat.value - .955) / .04));
    place();
    if (more && onscreen && !document.hidden) raf = requestAnimationFrame(tick);
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
  new MutationObserver(wake).observe(stage, { attributes: true, attributeFilter: ['data-assembly', 'data-phase'] });
  new ResizeObserver(wake).observe(stage);
  new IntersectionObserver(entries => { onscreen = entries[0].isIntersecting; if (onscreen) wake(); }).observe(stage);
  document.addEventListener('visibilitychange', wake);
  boat.step(0, true);
  wake();
}

if (typeof document !== 'undefined' && document.querySelector('#media-stage')) mount();
