// ESMI "Explore the E-Boat" highlights.
// Click → the camera drops down through the landing scene under the sea, then a
// grid of floating highlight cards rises in. The background is a WebGL sea (light rays,
// caustics, drifting particles, ripples under the cursor) that gets deeper as you scroll.
// Cards trail the scroll at their own pace (the "flow"), and the list can be dragged with
// a hold cursor that stretches with speed. Card images are drawn with WebGL: they curl
// like a sheet over a drum near the top and bottom of the screen, warp with scroll speed,
// tilt with the cursor and ripple under it like the landing water. The pointer system
// (trailing ring, magnetic controls, eased camera drift) uses the same constants as
// landing-effects.js so both pages feel the same. Pill buttons get a rolling label.

import { underwaterPlunge } from './ui-sound.js';

const ITEMS = [
  { title: 'The Twin Hulls', tags: 'Silver topsides, charcoal keels', group: 'Engineering', img: './assets/eboats/hulls.webp', go: { chapter: 'Hull' } },
  { title: 'Electric Drive', tags: 'Pod motor and propeller', group: 'Engineering', img: './assets/eboats/drive.webp', go: { chapter: 'Drive' } },
  { title: 'Battery Pack', tags: 'Eight modules under the deck', group: 'Energy', img: './assets/eboats/battery.webp', go: { chapter: 'Battery' } },
  { title: 'Every Connection', tags: 'Controllers and cable looms', group: 'Engineering', img: './assets/eboats/wiring.webp', go: { chapter: 'Wiring' } },
  { title: 'Seating for Four', tags: 'Bucket seats, open views', group: 'Comfort', img: './assets/eboats/seating.webp', go: { chapter: 'Seating' } },
  { title: 'The Helm', tags: 'ESMI console and steering', group: 'Comfort', img: './assets/eboats/helm.webp', go: { chapter: 'Helm' } },
  { title: 'Solar Canopy', tags: 'Twelve photovoltaic modules', group: 'Energy', img: './assets/eboats/solar.webp', go: { chapter: 'Solar' } },
  { title: 'The Film', tags: 'From the sun. To the sea.', group: 'Film', img: './assets/eboats/film.webp', go: { film: true } },
];
const GROUPS = ['All', 'Engineering', 'Energy', 'Comfort', 'Film'];
const EASE_IN_OUT = 'cubic-bezier(.76,0,.24,1)';
const EASE_OUT = 'cubic-bezier(.22,1,.36,1)';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const finePointer = matchMedia('(any-pointer:fine)');
const $ = (s, r = document) => r.querySelector(s);
let root, stage, scroller, grid, canvas, cursorEl, gl, program, cards = [];
let open = false, busy = false, raf = 0, lastScroll = 0, velocity = 0, startedAt = performance.now();
const view = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
const pointer = { x: -100, y: -100, tx: -100, ty: -100, vx: 0, vy: 0, scale: 1, ts: 1, seen: false };
const magnets = new Map();
let activeMagnet = null, prevFrame = 0, scrollTarget = 0, scrollCurrent = 0, wheelActive = false;
let sea = null, seaCanvas, ringEl, drag = null, suppressClick = false, press = 0, zoom = 1;
// Pointer shake: a lightly damped spring driven by how fast the pointer sweeps sideways.
const shake = { raw: 0, s: 0, v: 0, lastX: null, lastT: 0 };
let flakeCanvas, flakeCtx, flakes = [];

/* ------------------------------------------------------------ roll buttons -- */
// The label rolls up and an identical copy rises from below while an ink fill sweeps in.
export function rollify(button) {
  if (!button || button.classList.contains('has-roll')) return;
  const label = button.innerHTML;
  button.innerHTML = `<span class="roll"><span class="roll-row">${label}</span><span class="roll-row" aria-hidden="true">${label}</span></span><span class="roll-fill" aria-hidden="true"></span>`;
  button.classList.add('has-roll');
}
document.querySelectorAll('.landing-primary, .landing-film-pill').forEach(rollify);

function build() {
  root = document.createElement('section');
  root.className = 'eb';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'eb-title');
  root.hidden = true;
  const counts = Object.fromEntries(GROUPS.map(g => [g, g === 'All' ? ITEMS.length : ITEMS.filter(i => i.group === g).length]));
  root.innerHTML = `
    <div class="eb-stage">
      <canvas class="eb-sea" aria-hidden="true"></canvas>
      <canvas class="eb-gl" aria-hidden="true"></canvas>
      <canvas class="eb-flakes" aria-hidden="true"></canvas>
      <div class="eb-scroll">
        <div class="eb-grid">${ITEMS.map((item, i) => `
          <a class="eb-card" href="#" draggable="false" data-index="${i}" data-group="${item.group}">
            <span class="eb-float">
              <span class="eb-media"><img src="${item.img}" alt="" draggable="false" loading="${i < 4 ? 'eager' : 'lazy'}" decoding="async"></span>
              <span class="eb-meta"><span class="eb-name">${item.title}</span><span class="eb-tags">${item.group} · ${item.tags}</span><span class="eb-arrow" aria-hidden="true">↘</span></span>
            </span>
          </a>`).join('')}
        </div>
      </div>
      <header class="eb-head">
        <h2 id="eb-title" class="eb-title"><span class="eb-title-serif">The</span> <span class="eb-title-sans">ESMI E-Boat</span></h2>
        <div class="eb-filters" role="group" aria-label="Filter highlights">${GROUPS.map((g, i) => `
          <button type="button" class="eb-pill" data-group="${g}" aria-pressed="${i === 0}">${g}<sup>${counts[g]}</sup></button>`).join('')}
        </div>
      </header>
      <button type="button" class="eb-close" aria-label="Close the E-Boat highlights"><span></span><span></span></button>
    </div>
    <div class="eb-water" aria-hidden="true"></div>
    <canvas class="eb-bubbles" aria-hidden="true"></canvas>
    <span class="eb-cursor" aria-hidden="true"><span class="eb-cursor-halo"></span><span class="eb-cursor-ring"></span><span class="eb-cursor-label"><span class="eb-cl-view">View</span><span class="eb-cl-drag"><b>↑</b>Drag<b>↓</b></span></span></span>`;
  document.body.appendChild(root);
  stage = $('.eb-stage', root);
  scroller = $('.eb-scroll', root);
  grid = $('.eb-grid', root);
  canvas = $('.eb-gl', root);
  cursorEl = $('.eb-cursor', root);
  ringEl = $('.eb-cursor-ring', root);
  seaCanvas = $('.eb-sea', root);
  flakeCanvas = $('.eb-flakes', root);
  flakeCtx = flakeCanvas.getContext('2d');
  root.querySelectorAll('.eb-pill').forEach(rollify);
  cards = [...root.querySelectorAll('.eb-card')].map((el, i) => ({ el, float: $('.eb-float', el), media: $('.eb-media', el), meta: $('.eb-meta', el), img: $('img', el), tex: null, size: [1, 1], hover: 0, hoverTarget: 0, shown: true, depth: 0, fAlpha: 1, tweens: [] }));
  cards.forEach((card, i) => {
    card.el.addEventListener('click', event => { event.preventDefault(); choose(ITEMS[i]); });
    card.el.addEventListener('pointerenter', () => { card.hoverTarget = 1; });
    card.el.addEventListener('pointerleave', () => { card.hoverTarget = 0; });
  });
  root.querySelectorAll('.eb-pill').forEach(pill => pill.addEventListener('click', () => filter(pill.dataset.group)));
  $('.eb-close', root).addEventListener('click', () => close());
  root.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
  root.addEventListener('pointermove', movePointer);
  // Eased wheel scrolling (touch keeps native momentum): glide toward the target.
  scroller.addEventListener('wheel', event => {
    if (reduced.matches || event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 32 : event.deltaMode === 2 ? innerHeight : 1;
    if (!wheelActive) scrollTarget = scrollCurrent = scroller.scrollTop;
    wheelActive = true;
    scrollTarget = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, scrollTarget + event.deltaY * unit));
  }, { passive: false });
  scroller.addEventListener('scroll', () => { if (!wheelActive) scrollTarget = scrollCurrent = scroller.scrollTop; }, { passive: true });
  // Drag to scroll (mouse): press shows the hold cursor, moving grabs the list, release throws it.
  scroller.addEventListener('pointerdown', startDrag);
  scroller.addEventListener('pointermove', moveDrag);
  scroller.addEventListener('pointerup', endDrag);
  scroller.addEventListener('pointercancel', endDrag);
  scroller.addEventListener('lostpointercapture', endDrag);
  scroller.addEventListener('dragstart', event => event.preventDefault());
  scroller.addEventListener('click', event => {
    if (!suppressClick) return;
    suppressClick = false; event.preventDefault(); event.stopPropagation();
  }, true);
  root.addEventListener('pointerleave', () => { view.tx = view.ty = 0; root.classList.remove('eb-pointer'); });
  initGL();
  initSea();
}

/* ------------------------------------------------------------ drag ---------- */
const maxScroll = () => Math.max(0, scroller.scrollHeight - scroller.clientHeight);
function startDrag(event) {
  if (event.pointerType !== 'mouse' || event.button !== 0 || reduced.matches || busy) return;
  if (event.target.closest('button')) return;
  if (!wheelActive) scrollTarget = scrollCurrent = scroller.scrollTop;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start: scrollTarget, moved: false, lastY: event.clientY, lastT: event.timeStamp, v: 0 };
  root.classList.add('eb-holding');
}
function moveDrag(event) {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
  if (!drag.moved && Math.hypot(dx, dy) > 6) {
    drag.moved = true;
    root.classList.add('eb-dragging');
    try { scroller.setPointerCapture(drag.id); } catch {}
  }
  if (!drag.moved) return;
  const dt = Math.max(1, event.timeStamp - drag.lastT);
  drag.v += ((event.clientY - drag.lastY) / dt - drag.v) * .35;   // px per ms, smoothed
  drag.lastY = event.clientY; drag.lastT = event.timeStamp;
  wheelActive = true;
  scrollTarget = Math.max(0, Math.min(maxScroll(), drag.start - dy * 1.5));
}
function endDrag(event) {
  if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.id)) return;
  if (drag.moved) {
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    // Throw: carry the release speed on as inertia (stale speed decays if the hand had stopped).
    const idle = Math.min(1, (event.timeStamp - drag.lastT) / 120);
    scrollTarget = Math.max(0, Math.min(maxScroll(), scrollTarget - drag.v * (1 - idle) * 420));
    try { scroller.releasePointerCapture(drag.id); } catch {}
  }
  drag = null;
  root.classList.remove('eb-holding', 'eb-dragging');
}

/* ---------------------------------------------------------- pointer --------- */
// Same feel as landing-effects.js: spring camera drift (~0.45 s), a damped-spring ring
// (fast follow, 45 ms) that grows over controls, and magnetic controls (0.18 of the offset, ≤ 5–7 px).
function movePointer(event) {
  if (event.pointerType !== 'mouse' || reduced.matches) return;
  if (!pointer.seen) { pointer.x = event.clientX; pointer.y = event.clientY; pointer.seen = true; }
  pointer.tx = event.clientX; pointer.ty = event.clientY;
  root.classList.add('eb-pointer');
  view.tx = Math.max(-1, Math.min(1, (event.clientX / innerWidth - .5) * 2));
  view.ty = Math.max(-1, Math.min(1, (event.clientY / innerHeight - .5) * 2));
  const control = event.target.closest?.('button, .eb-card');
  root.dataset.cursorMode = control ? (control.classList.contains('eb-card') ? 'card' : 'control') : 'scene';
  const magnetic = control && control.tagName === 'BUTTON' ? control : null;
  if (activeMagnet && activeMagnet.el !== magnetic) { activeMagnet.tx = activeMagnet.ty = 0; activeMagnet = null; }
  if (magnetic) {
    if (!magnets.has(magnetic)) magnets.set(magnetic, { el: magnetic, x: 0, y: 0, tx: 0, ty: 0 });
    activeMagnet = magnets.get(magnetic);
    const b = magnetic.getBoundingClientRect(), limit = magnetic.classList.contains('eb-close') ? 7 : 5;
    activeMagnet.tx = Math.max(-limit, Math.min(limit, (event.clientX - (b.left + b.width / 2 - activeMagnet.x)) * .18));
    activeMagnet.ty = Math.max(-limit, Math.min(limit, (event.clientY - (b.top + b.height / 2 - activeMagnet.y)) * .18));
  }
}

function updateMotion(now) {
  const dt = Math.min(.033, Math.max(.001, (now - (prevFrame || now - 16.7)) / 1000));
  prevFrame = now;
  const ease = 1 - Math.exp(-dt / .24);
  // Same camera spring as the landing page: critically damped, ~0.45 s to rest.
  const omega = 10;
  view.vx += ((view.tx - view.x) * omega * omega - view.vx * 2 * omega) * dt;
  view.vy += ((view.ty - view.y) * omega * omega - view.vy * 2 * omega) * dt;
  view.x += view.vx * dt; view.y += view.vy * dt;
  root.style.setProperty('--eb-view-x', `${(-view.x * innerWidth * .018).toFixed(2)}px`);
  root.style.setProperty('--eb-view-y', `${(-view.y * innerHeight * .014).toFixed(2)}px`);
  root.style.setProperty('--eb-bg-x', `${(view.x * innerWidth * .03).toFixed(2)}px`);
  root.style.setProperty('--eb-bg-y', `${(view.y * innerHeight * .02).toFixed(2)}px`);
  root.style.setProperty('--eb-yaw', `${(view.x * 2.5).toFixed(3)}deg`);
  root.style.setProperty('--eb-pitch', `${(-view.y * 1.2).toFixed(3)}deg`);
  // Fast follow (same as the landing ring): ~90% of the gap closed in 0.1 s.
  const follow = 1 - Math.exp(-dt / .045);
  const nx = pointer.x + (pointer.tx - pointer.x) * follow, ny = pointer.y + (pointer.ty - pointer.y) * follow;
  pointer.vx = (nx - pointer.x) / dt; pointer.vy = (ny - pointer.y) / dt;
  pointer.x = nx; pointer.y = ny;
  const mode = root.dataset.cursorMode;
  pointer.ts = drag?.moved ? 2.35 : drag ? .72 : mode === 'card' ? .4 : mode === 'control' ? 1.55 : 1;
  pointer.scale += (pointer.ts - pointer.scale) * (1 - Math.exp(-dt / .08));
  cursorEl.style.transform = `translate3d(${pointer.x.toFixed(1)}px,${pointer.y.toFixed(1)}px,0)`;
  // The ring stretches along its direction of travel, like a drop moving through water.
  const speed = Math.hypot(pointer.vx, pointer.vy), stretch = Math.min(.42, speed / 3200);
  const angle = Math.atan2(pointer.vy, pointer.vx);
  ringEl.style.transform = `rotate(${angle.toFixed(3)}rad) scale(${(pointer.scale * (1 + stretch)).toFixed(3)},${(pointer.scale * (1 - stretch * .55)).toFixed(3)})`;
  press += ((drag ? 1 : 0) - press) * (1 - Math.exp(-dt / .18));
  // While the list is held the whole sheet pulls back a touch, like unseen's drag.
  zoom += ((drag?.moved ? .94 : 1) - zoom) * (1 - Math.exp(-dt / .22));
  root.style.setProperty('--eb-zoom', zoom.toFixed(4));
  // Shake: sweep the pointer left/right and the page whips after it, overshoots and
  // shivers back to rest (underdamped spring: stiffness 170, damping 9).
  shake.raw *= Math.exp(-dt / .07);
  const target = reduced.matches ? 0 : Math.max(-1, Math.min(1, shake.raw / 1700));
  shake.v += ((target - shake.s) * 170 - shake.v * 9) * dt;
  shake.s += shake.v * dt;
  if (Math.abs(shake.s) < .0005 && Math.abs(shake.v) < .002) shake.s = shake.v = 0;
  root.style.setProperty('--eb-shake-x', `${(shake.s * 16).toFixed(2)}px`);
  root.style.setProperty('--eb-skew', `${(-shake.s * 2.4).toFixed(3)}deg`);
  root.style.setProperty('--eb-split', `${(shake.s * 3.2).toFixed(2)}px`);
  magnets.forEach(m => {
    m.x += (m.tx - m.x) * ease; m.y += (m.ty - m.y) * ease;
    m.el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
  });
  // (unseen-style: cards move with the scroll as one sheet; the flow is the ripple in the shader)
}

/* ------------------------------------------------------------ WebGL --------- */
// Cards are rendered the way unseen.co renders its project grid: flat planes in a real
// perspective scene (camera ~1000 units in front of the card plane, 1 unit = 2 px).
//  - flow: a constant diagonal ripple rolls through every card (crests catch light)
//  - depth: above the bend line the cards fold back up to 1200 units into the water,
//    with a slow wave along the fold, and fade into the fog
//  - camera: orbits the card plane toward the mouse, rolls with mouse speed, floats
//  - cursor: a fluid-like wake smears and brightens whatever it passes over
//  - hover: the image zooms 1.1x inside its frame
const UNIT = 2;            // px per scene unit at the card plane
const CAM = 1000;          // camera distance to the card plane, in units
const TRAIL = 14;          // cursor wake samples
const VERT = `
precision highp float;
attribute vec2 aUv;
uniform vec4 uRect; uniform vec2 uView; uniform float uTime; uniform mat3 uCam; uniform vec2 uBend; uniform float uDepth;
varying vec2 vUv; varying float vRipple; varying float vDist;
void main(){
  vec2 px = uRect.xy + aUv * uRect.zw;
  vec3 w = vec3(px.x - uView.x * 0.5, uView.y * 0.5 - px.y, 0.0) / ${UNIT}.0;   // scene units, y up
  float noise = sin((w.x - w.y * 0.1) * 0.03 - uTime * 1.1 + 6.7) * 50.0;
  float ripple = sin((w.x - w.y) * 0.02 - uTime * 2.0) * 12.0;
  float bend = smoothstep(uBend.x, uBend.y, w.y);
  w.z += ripple - 1200.0 * bend - noise * bend + uDepth;
  vRipple = ripple;
  w = uCam * w;
  float d = ${CAM}.0 - w.z;
  vDist = d;
  vUv = aUv;
  // perspective: the card plane (z = 0) maps 1:1 onto its DOM rectangle
  gl_Position = vec4(w.x * ${UNIT}.0 * ${CAM}.0 / (uView.x * 0.5), w.y * ${UNIT}.0 * ${CAM}.0 / (uView.y * 0.5), 0.0, d);
}`;
const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform vec2 uImg; uniform vec4 uRect; uniform float uInner; uniform float uAlpha; uniform float uLabel;
uniform vec3 uFog; uniform vec2 uView; uniform float uDpr; uniform vec4 uTrail[${TRAIL}]; uniform float uTrailLife[${TRAIL}];
varying vec2 vUv; varying float vRipple; varying float vDist;
void main(){
  // cursor wake: each recent pointer sample drags the picture along its motion
  vec2 frag = vec2(gl_FragCoord.x, uView.y * uDpr - gl_FragCoord.y) / uDpr;
  vec2 push = vec2(0.0); float wake = 0.0;
  for (int i = 0; i < ${TRAIL}; i++) {
    vec4 s = uTrail[i]; float life = uTrailLife[i];
    vec2 dv = frag - s.xy; float f = exp(-dot(dv, dv) / 5200.0) * life;
    push += s.zw * f; wake += length(s.zw) * f;
  }
  vec2 q = vUv - push / uRect.zw * 0.55;
  vec2 uv = q;
  if (uLabel < 0.5) {
    float ra = uRect.z / uRect.w, ri = uImg.x / uImg.y;
    vec2 s = ra > ri ? vec2(1.0, ri / ra) : vec2(ra / ri, 1.0);
    uv = (q - 0.5) * s / uInner + 0.5;     // cover, zoomed from the centre on hover
  }
  vec4 c = texture2D(uTex, uv);
  c.rgb += smoothstep(0.0, 10.0, vRipple * 0.3) * 0.3 * (1.0 - uLabel * 0.7);
  c.rgb += min(wake * 0.0035, 0.18);
  c.a *= smoothstep(2000.0, 1500.0, vDist);
  c.rgb = mix(c.rgb, uFog, smoothstep(500.0, 4500.0, vDist));
  gl_FragColor = vec4(c.rgb, c.a * uAlpha);
}`;

function mat3Camera(yaw, pitch, roll) {
  // world -> camera rotation (transpose of the camera's own rotation)
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const Ry = [cy, 0, -sy, 0, 1, 0, sy, 0, cy], Rx = [1, 0, 0, 0, cp, sp, 0, -sp, cp], Rz = [cr, sr, 0, -sr, cr, 0, 0, 0, 1];
  const mul = (a, b) => { const o = []; for (let c = 0; c < 3; c++) for (let r = 0; r < 3; r++) o[c * 3 + r] = a[r] * b[c * 3] + a[3 + r] * b[c * 3 + 1] + a[6 + r] * b[c * 3 + 2]; return o; };
  const R = mul(mul(Rx, Ry), Rz);
  return new Float32Array([R[0], R[3], R[6], R[1], R[4], R[7], R[2], R[5], R[8]]);
}

function texFrom(source) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// Card titles are drawn into the scene too (as on unseen), so they fold back with their card.
function drawLabel(card) {
  if (!gl) return;
  const r = card.meta.getBoundingClientRect(); if (r.width < 2) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.ceil(r.width), h = Math.ceil(r.height);
  const cv = card.labelCanvas || (card.labelCanvas = document.createElement('canvas'));
  cv.width = w * dpr; cv.height = h * dpr;
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const name = $('.eb-name', card.el), tags = $('.eb-tags', card.el), arrow = $('.eb-arrow', card.el);
  const box = el => el.getBoundingClientRect(), font = el => { const s = getComputedStyle(el); return `${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; };
  ctx.textBaseline = 'top'; ctx.fillStyle = '#e9f5f6';
  for (const [el, alpha] of [[name, 1], [tags, .88], [arrow, 1]]) {
    const b = box(el); ctx.globalAlpha = alpha; ctx.font = font(el);
    ctx.fillText(el.textContent, b.left - r.left, b.top - r.top + (b.height - parseFloat(getComputedStyle(el).fontSize)) / 2);
  }
  ctx.globalAlpha = .25; ctx.fillRect(0, h - 1, w, 1); ctx.globalAlpha = 1;
  if (card.labelTex) gl.deleteTexture(card.labelTex);
  card.labelTex = texFrom(cv); card.labelSize = [w, h];
}
function drawLabels() { if (gl) cards.forEach(drawLabel); }

function initGL() {
  if (reduced.matches) return;
  gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: true, alpha: true });
  if (!gl) return;
  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) { console.warn('[eboats] WebGL unavailable', error); gl = null; return; }
  const N = 24, uvs = [], idx = [];
  for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) uvs.push(x / N, y / N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const a = y * (N + 1) + x, b = a + 1, c = a + N + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  program.count = idx.length;
  gl.useProgram(program);
  const loc = gl.getAttribLocation(program, 'aUv');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  program.u = Object.fromEntries(['uRect', 'uView', 'uTime', 'uCam', 'uBend', 'uDepth', 'uTex', 'uImg', 'uInner', 'uAlpha', 'uLabel', 'uFog', 'uDpr', 'uTrail', 'uTrailLife'].map(n => [n, gl.getUniformLocation(program, n)]));
  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND); gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  cards.forEach(card => {
    const load = () => { card.tex = texFrom(card.img); card.size = [card.img.naturalWidth, card.img.naturalHeight]; card.el.classList.add('is-gl'); };
    if (card.img.complete && card.img.naturalWidth) load(); else card.img.addEventListener('load', load, { once: true });
  });
  (document.fonts?.ready || Promise.resolve()).then(() => requestAnimationFrame(drawLabels));
  root.classList.add('has-gl');
}

// Tiny tween helper (power2.out like unseen's GSAP defaults).
const power2Out = t => 1 - (1 - t) * (1 - t);
function tween(card, key, to, duration, delay = 0) {
  card.tweens = (card.tweens || []).filter(t => t.key !== key);
  card.tweens.push({ key, from: card[key], to, start: performance.now() + delay * 1000, duration: duration * 1000 });
}
function runTweens(card, now) {
  if (!card.tweens?.length) return;
  card.tweens = card.tweens.filter(t => {
    if (now < t.start) return true;
    const k = Math.min(1, (now - t.start) / t.duration);
    card[t.key] = t.from + (t.to - t.from) * power2Out(k);
    return k < 1;
  });
}

const trail = Array.from({ length: TRAIL }, () => ({ x: -1e4, y: -1e4, vx: 0, vy: 0, life: 0 }));
let trailHead = 0, lastTrail = null;
const camState = { mx: 0, my: 0, mx2: 0, my2: 0 };

function frame(now) {
  raf = 0;
  if (!open) return;
  updateMotion(now);
  const dt = Math.min(.05, Math.max(.001, (now - (frame.last || now - 16.7)) / 1000)); frame.last = now;
  const f60 = dt * 60;
  if (wheelActive) {
    // unseen: smoothScrollPos += 0.05 * (scrollPos - smoothScrollPos) per frame (faster while dragging)
    const k = 1 - Math.pow(1 - (drag?.moved ? .16 : .05), f60);
    scrollCurrent += (scrollTarget - scrollCurrent) * k;
    if (!drag && Math.abs(scrollTarget - scrollCurrent) < .4) { scrollCurrent = scrollTarget; wheelActive = false; }
    scroller.scrollTop = scrollCurrent;
  }
  const st = scroller.scrollTop;
  velocity += ((st - lastScroll) / 38 - velocity) * .14;
  lastScroll = st;
  drawSea(now, st);
  if (gl) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = innerWidth, h = innerHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    // camera: eased mouse (0.075 / 0.02 per frame), yaw 0.05 rad, pitch 0.035 rad, roll from the
    // difference of the two, plus a slow float
    const nx = pointer.seen ? (pointer.tx / w) * 2 - 1 : 0, ny = pointer.seen ? 1 - (pointer.ty / h) * 2 : 0;
    const k1 = 1 - Math.pow(1 - .075, f60), k2 = 1 - Math.pow(1 - .02, f60);
    camState.mx += (nx - camState.mx) * k1; camState.my += (ny - camState.my) * k1;
    camState.mx2 += (nx - camState.mx2) * k2; camState.my2 += (ny - camState.my2) * k2;
    const t = (now - startedAt) / 1000, still = !finePointer.matches || reduced.matches;
    const floatY = still ? 0 : Math.sin(t * .59 * 2.1) * .0045 + Math.sin(t * .37 + 1.3) * .003;
    const floatX = still ? 0 : Math.sin(t * .59 * 1.7 + 2) * .004;
    const yaw = (still ? 0 : -camState.mx * .05) + floatY, pitch = (still ? 0 : camState.my * .035) + floatX;
    const roll = still ? 0 : -.05 * (camState.mx - camState.mx2);
    gl.uniformMatrix3fv(program.u.uCam, false, mat3Camera(yaw, pitch, roll));
    // cursor wake samples (fluid-like): newest first, they fade over ~0.6 s
    if (pointer.seen && !still) {
      const p = { x: pointer.tx, y: pointer.ty };
      if (lastTrail) {
        const vx = (p.x - lastTrail.x) / f60, vy = (p.y - lastTrail.y) / f60;
        if (Math.hypot(vx, vy) > .5) { trailHead = (trailHead + 1) % TRAIL; Object.assign(trail[trailHead], { x: p.x, y: p.y, vx, vy, life: 1 }); }
      }
      lastTrail = p;
    }
    const tr = new Float32Array(TRAIL * 4), tl = new Float32Array(TRAIL);
    trail.forEach((s, i) => { s.life = Math.max(0, s.life - dt / .6); tr.set([s.x, s.y, s.vx, s.vy], i * 4); tl[i] = s.life * s.life; });
    gl.uniform4fv(program.u.uTrail, tr); gl.uniform1fv(program.u.uTrailLife, tl);
    gl.uniform2f(program.u.uView, w, h);
    gl.uniform1f(program.u.uDpr, dpr);
    gl.uniform1f(program.u.uTime, t);
    const s = h / 1100;
    gl.uniform2f(program.u.uBend, 100 * (w < 760 ? 1 : s), (w < 760 ? 500 : 700 * s));
    gl.uniform3f(program.u.uFog, .05, .27, .36);
    const stageTop = stage.getBoundingClientRect().top;
    for (const c of cards) {
      runTweens(c, now);
      c.hover += (c.hoverTarget - c.hover) * (1 - Math.exp(-dt / .09));
      if (!c.tex || (!c.shown && c.fAlpha <= .001)) continue;
      const r = c.media.getBoundingClientRect();
      if (r.bottom < -h * .6 || r.top > h * 1.3 || r.width < 2) continue;
      const alpha = (Number(getComputedStyle(c.el).opacity) || 0) * c.fAlpha * (stageTop > h * .98 ? 0 : 1);
      if (alpha <= .01) continue;
      gl.uniform1f(program.u.uDepth, c.depth);
      gl.uniform1f(program.u.uAlpha, alpha);
      gl.uniform1f(program.u.uLabel, 0);
      gl.bindTexture(gl.TEXTURE_2D, c.tex);
      gl.uniform4f(program.u.uRect, r.left, r.top, r.width, r.height);
      gl.uniform2f(program.u.uImg, c.size[0], c.size[1]);
      gl.uniform1f(program.u.uInner, 1 + .1 * c.hover);
      gl.drawElements(gl.TRIANGLES, program.count, gl.UNSIGNED_SHORT, 0);
      if (c.labelTex) {
        const m = c.meta.getBoundingClientRect();
        gl.bindTexture(gl.TEXTURE_2D, c.labelTex);
        gl.uniform1f(program.u.uLabel, 1);
        gl.uniform4f(program.u.uRect, m.left, m.top, c.labelSize[0], c.labelSize[1]);
        gl.uniform1f(program.u.uInner, 1);
        gl.drawElements(gl.TRIANGLES, program.count, gl.UNSIGNED_SHORT, 0);
      }
    }
  }
  raf = requestAnimationFrame(frame);
}

/* ------------------------------------------------------------ flakes ------- */
// Pale flakes peel off the cards where they fold over the drum (top and bottom of the
// screen) while the list moves, then tumble and drift in the water. The cursor pushes them.
const FLAKE_MAX = 240;
function spawnFlake(x, y, dir) {
  const n = 4 + Math.floor(Math.random() * 3), pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * 6.2832 + Math.random() * .7; pts.push([Math.cos(a) * (.55 + Math.random() * .45), Math.sin(a) * (.35 + Math.random() * .3)]); }
  flakes.push({ x, y, vx: (Math.random() - .5) * 140, vy: dir * (60 + Math.random() * 160), size: 4 + Math.pow(Math.random(), 2) * 13,
    rot: Math.random() * 6.28, spin: (Math.random() - .5) * 6, flip: Math.random() * 6.28, flipV: 3 + Math.random() * 7,
    life: 0, ttl: 1.6 + Math.random() * 2.2, pts });
  if (flakes.length > FLAKE_MAX) flakes.shift();
}
function updateFlakes(now, st) {
  if (!flakeCtx || reduced.matches) return;
  const w = innerWidth, h = innerHeight, dpr = Math.min(devicePixelRatio || 1, 2);
  if (flakeCanvas.width !== Math.round(w * dpr) || flakeCanvas.height !== Math.round(h * dpr)) { flakeCanvas.width = Math.round(w * dpr); flakeCanvas.height = Math.round(h * dpr); }
  const dt = Math.min(.033, Math.max(.001, (now - (updateFlakes.last || now - 16.7)) / 1000)); updateFlakes.last = now;
  const delta = st - (updateFlakes.st ?? st); updateFlakes.st = st;
  // Emit from the fold lines of visible cards, more the faster the list is moving.
  const speed = 0;
  if (speed > .08) {
    const lines = [h * .34, h * .66];
    for (const c of cards) {
      if (!c.shown) continue;
      const r = c.media.getBoundingClientRect();
      for (let li = 0; li < 2; li++) {
        const ly = lines[li];
        if (r.top > ly || r.bottom < ly) continue;
        const want = speed * (li === 0 ? (velocity < 0 ? 3.5 : 1.5) : (velocity > 0 ? 3.5 : 1.5)) * dt * 30;
        for (let k = 0; k < want; k++) if (Math.random() < Math.min(1, want - k)) spawnFlake(r.left + Math.random() * r.width, ly + (Math.random() - .5) * 30, li === 0 ? -1 : 1);
      }
    }
  }
  const ctx = flakeCtx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
  const px = pointer.x, py = pointer.y;
  flakes = flakes.filter(f => (f.life += dt) < f.ttl);
  for (const f of flakes) {
    // drag of the water, a slow sink, the scroll carrying them a little, and the cursor's wake
    f.vx *= Math.exp(-dt * 1.6); f.vy = f.vy * Math.exp(-dt * 1.6) + 28 * dt;
    f.y -= delta * .35;
    const dx = f.x - px, dy = f.y - py, d2 = dx * dx + dy * dy;
    if (d2 < 140 * 140) { const d = Math.sqrt(d2) || 1, push = (1 - d / 140) * 900 * dt; f.vx += dx / d * push + pointer.vx * .02 * (1 - d / 140); f.vy += dy / d * push + pointer.vy * .02 * (1 - d / 140); }
    f.x += (f.vx + Math.sin(f.life * 2 + f.flip) * 12) * dt; f.y += f.vy * dt;
    f.rot += f.spin * dt; f.flip += f.flipV * dt;
    const fade = Math.min(1, f.life / .15) * Math.min(1, (f.ttl - f.life) / .6);
    const face = Math.cos(f.flip);
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.rot); ctx.scale(f.size, f.size * Math.max(.08, Math.abs(face)));
    ctx.beginPath(); f.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
    const lum = face > 0 ? 238 : 205;
    ctx.fillStyle = `rgba(${lum - 8},${lum + 6 > 255 ? 255 : lum + 6},${lum + 10 > 255 ? 255 : lum + 10},${(.85 * fade).toFixed(3)})`;
    ctx.fill(); ctx.restore();
  }
}

/* ------------------------------------------------------------ sea ---------- */
// Full-screen underwater background, drawn at reduced resolution (it is soft by nature).
// Surface light at the top, slow god rays, caustic light nets, two layers of drifting
// particles and rising bubbles with scroll parallax, a lamp and ripples that follow the
// cursor, and the water gets darker the deeper you scroll.
const SEA_VERT = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const SEA_FRAG = `
precision mediump float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uPointer; uniform vec2 uView; uniform float uScroll; uniform float uDepth; uniform float uPress; uniform float uSeen; uniform float uShake;
varying vec2 vUv;
float hash(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
vec2 hash2(vec2 p){ float n = hash(p); return vec2(n, hash(p + n * 19.19)); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
// distance between the two nearest moving cell points: thin bright seams = caustic net
float net(vec2 p, float t){
  vec2 g = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y)), h = hash2(g + o);
    vec2 c = o + 0.5 + 0.4 * sin(t + 6.2831 * h);
    float d = length(c - f);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return d2 - d1;
}
void main(){
  float aspect = uRes.x / uRes.y, t = uTime, s = uScroll / uRes.y;
  vec2 p = vec2((vUv.x - 0.5) * aspect, vUv.y);
  // pointer shake sloshes the whole water column sideways in a travelling wave
  p.x += uShake * (0.035 + sin(p.y * 9.0 - t * 7.0) * 0.012);
  vec2 m = vec2((uPointer.x / uRes.x - 0.5) * aspect, 1.0 - uPointer.y / uRes.y);
  vec2 dm = p - m; float dl = length(dm);
  // ripples spread from the cursor, stronger while the list is held
  p += (dl > 0.0001 ? dm / dl : vec2(0.0)) * sin(dl * 55.0 - t * 5.0) * exp(-dl * 8.0) * (0.003 + 0.012 * uPress) * uSeen;
  float depth = clamp(uDepth, 0.0, 1.0);
  float y = p.y - uView.y * 0.03;
  vec3 deep = vec3(0.008, 0.055, 0.105), mid = vec3(0.025, 0.24, 0.34), shallow = vec3(0.2, 0.62, 0.7);
  vec3 col = mix(deep, mid, smoothstep(-0.05, 0.8, y));
  col = mix(col, shallow, smoothstep(0.6, 1.08, y) * (1.0 - depth * 0.55));
  col *= 1.0 - depth * 0.38;
  // god rays fanning down from a sun above the surface
  vec2 d = p - vec2(uView.x * 0.22 + 0.15, 1.9);
  float a = atan(d.x, -d.y);
  float rays = (sin(a * 21.0 + t * 0.31) * 0.5 + 0.5) * (sin(a * 34.0 - t * 0.23 + 1.3) * 0.5 + 0.5);
  rays += (sin(a * 9.0 + t * 0.13) * 0.5 + 0.5) * 0.45;
  rays = pow(rays * 0.75, 2.2);
  col += vec3(0.5, 0.85, 0.9) * rays * smoothstep(-0.15, 1.0, y) * (1.0 - depth * 0.7) * 0.26;
  // caustics, drifting and warped
  vec2 cp = vec2(p.x + uView.x * 0.02, p.y * 1.5 - s * 0.2) * 3.4;
  cp += vec2(noise(cp * 0.55 + t * 0.12), noise(cp * 0.55 - t * 0.1)) * 0.7;
  float c1 = net(cp, t * 0.75), c2 = net(cp * 1.4 + 3.7, t * 0.6 + 2.0);
  float caus = pow(1.0 - smoothstep(0.0, 0.16, c1), 3.0) + pow(1.0 - smoothstep(0.0, 0.12, c2), 3.0) * 0.7;
  col += vec3(0.55, 0.92, 0.95) * caus * smoothstep(0.2, 1.0, y) * 0.17 * (1.0 - depth * 0.55);
  // shimmering surface band
  col += shallow * smoothstep(0.9, 1.02, y) * (0.12 + 0.12 * noise(vec2(p.x * 9.0 + t * 0.6, t * 0.4)));
  // the cursor carries a soft lamp
  col += vec3(0.3, 0.72, 0.82) * exp(-dl * dl * 9.0) * 0.1 * uSeen;
  // marine snow: two parallax layers sinking slowly
  float snow = 0.0;
  for (int i = 0; i < 2; i++) {
    float fi = float(i), sc = 11.0 + fi * 9.0;
    vec2 q = (p + vec2(sin(t * 0.1 + fi) * 0.04, t * 0.01 * (fi + 1.0) - s * (0.25 + fi * 0.3))) * sc;
    vec2 g = floor(q), f = fract(q) - 0.5, h = hash2(g + fi * 17.0);
    float r = 0.035 + 0.05 * h.y;
    float tw = 0.55 + 0.45 * sin(t * (0.8 + h.x * 2.0) + h.y * 6.28);
    snow += smoothstep(r, r * 0.2, length(f - (h - 0.5) * 0.6)) * step(0.6, h.x) * tw * (0.4 + fi * 0.3);
  }
  col += vec3(0.75, 0.92, 0.95) * snow * 0.22;
  // a few bubbles rising and wobbling
  vec2 bq = (p - vec2(0.0, t * 0.07 - s * 0.45)) * 5.0;
  bq.x += sin(bq.y * 1.7 + floor(bq.x) * 2.1) * 0.12;
  vec2 bg = floor(bq), bf = fract(bq) - 0.5, bh = hash2(bg + 7.0);
  float br = 0.05 + 0.07 * bh.y, bd = length(bf - (bh - 0.5) * 0.5);
  float bub = step(0.82, bh.x) * (smoothstep(0.018, 0.0, abs(bd - br)) + smoothstep(br * 0.35, 0.0, length(bf - (bh - 0.5) * 0.5 + br * 0.38)) * 0.8);
  col += vec3(0.8, 0.95, 1.0) * bub * 0.3;
  // vignette and a breath of grain against banding
  vec2 v = vUv - 0.5;
  col *= 1.0 - dot(v, v) * 0.55;
  col += (hash(vUv * uRes + fract(t)) - 0.5) / 255.0 * 2.0;
  gl_FragColor = vec4(col, 1.0);
}`;

function initSea() {
  if (reduced.matches || !seaCanvas) return;
  const g = seaCanvas.getContext('webgl', { alpha: false, antialias: false, depth: false, powerPreference: 'high-performance' });
  if (!g) return;
  const compile = (type, src) => { const sh = g.createShader(type); g.shaderSource(sh, src); g.compileShader(sh); if (!g.getShaderParameter(sh, g.COMPILE_STATUS)) throw new Error(g.getShaderInfoLog(sh)); return sh; };
  try {
    const prog = g.createProgram();
    g.attachShader(prog, compile(g.VERTEX_SHADER, SEA_VERT));
    g.attachShader(prog, compile(g.FRAGMENT_SHADER, SEA_FRAG));
    g.linkProgram(prog);
    if (!g.getProgramParameter(prog, g.LINK_STATUS)) throw new Error(g.getProgramInfoLog(prog));
    g.useProgram(prog);
    g.bindBuffer(g.ARRAY_BUFFER, g.createBuffer());
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(prog, 'aPos');
    g.enableVertexAttribArray(loc); g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    const u = Object.fromEntries(['uRes', 'uTime', 'uPointer', 'uView', 'uScroll', 'uDepth', 'uPress', 'uSeen', 'uShake'].map(n => [n, g.getUniformLocation(prog, n)]));
    sea = { g, u, seen: 0 };
    root.classList.add('has-sea');
  } catch (error) { console.warn('[eboats] sea shader unavailable', error); sea = null; }
}

function drawSea(now, st) {
  if (!sea) return;
  const { g, u } = sea, w = innerWidth, h = innerHeight;
  // ~0.6 of CSS resolution keeps the fill cheap; the water is soft anyway.
  const k = Math.min(1, (devicePixelRatio || 1) * .6), cw = Math.round(w * k), ch = Math.round(h * k);
  if (seaCanvas.width !== cw || seaCanvas.height !== ch) { seaCanvas.width = cw; seaCanvas.height = ch; }
  sea.seen += ((pointer.seen && root.classList.contains('eb-pointer') ? 1 : 0) - sea.seen) * .06;
  g.viewport(0, 0, cw, ch);
  g.uniform2f(u.uRes, w, h);
  g.uniform1f(u.uTime, (now - startedAt) / 1000);
  g.uniform2f(u.uPointer, pointer.x, pointer.y);
  g.uniform2f(u.uView, view.x, view.y);
  g.uniform1f(u.uScroll, st);
  g.uniform1f(u.uDepth, st / Math.max(1, maxScroll()));
  g.uniform1f(u.uPress, press);
  g.uniform1f(u.uSeen, sea.seen);
  g.uniform1f(u.uShake, shake.s);
  g.drawArrays(g.TRIANGLES, 0, 3);
}

/* ------------------------------------------------------------ bubbles ------ */
// A burst of rising air bubbles, as if the camera has just dived under the surface.
function bubbles(duration = 2600) {
  if (reduced.matches) return Promise.resolve();
  const cv = $('.eb-bubbles', root), ctx = cv.getContext('2d');
  const dpr = Math.min(devicePixelRatio || 1, 2), w = innerWidth, h = innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const list = [];
  const spawn = (burst) => {
    const r = Math.pow(Math.random(), 2.2) * (w < 760 ? 16 : 26) + 1.5;
    list.push({ x: Math.random() * w, y: burst ? h + Math.random() * h * .9 : h + r + Math.random() * 40, r,
      vy: 320 + r * 26 + Math.random() * 260, amp: 4 + Math.random() * 14 + r * .25, freq: 1.5 + Math.random() * 3.5,
      phase: Math.random() * 6.28, born: performance.now(), stretch: .9 + Math.random() * .2 });
  };
  for (let i = 0; i < (w < 760 ? 90 : 170); i++) spawn(true);
  const start = performance.now();
  return new Promise(resolve => {
    let last = start;
    const step = now => {
      const dt = Math.min(.04, (now - last) / 1000), t = now - start; last = now;
      if (t < duration * .55) for (let i = 0; i < (w < 760 ? 2 : 4); i++) spawn(false);
      ctx.clearRect(0, 0, w, h);
      const fade = 1 - Math.max(0, (t - duration * .7) / (duration * .3));
      for (const b of list) {
        b.y -= b.vy * dt;
        b.vy *= 1 + dt * .35;
        const x = b.x + Math.sin((now - b.born) / 1000 * b.freq * 6.28 + b.phase) * b.amp;
        if (b.y < -b.r * 2) continue;
        const a = Math.min(1, (h - b.y) / 120) * fade;
        ctx.save();
        ctx.translate(x, b.y); ctx.scale(1 / b.stretch, b.stretch);
        const g = ctx.createRadialGradient(-b.r * .3, -b.r * .35, b.r * .1, 0, 0, b.r);
        g.addColorStop(0, `rgba(255,255,255,${.28 * a})`); g.addColorStop(.6, `rgba(210,240,255,${.06 * a})`); g.addColorStop(1, `rgba(255,255,255,${.22 * a})`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 6.2832); ctx.fill();
        ctx.lineWidth = Math.max(.8, b.r * .07); ctx.strokeStyle = `rgba(255,255,255,${.65 * a})`; ctx.stroke();
        ctx.beginPath(); ctx.arc(-b.r * .32, -b.r * .32, b.r * .22, 0, 6.2832); ctx.fillStyle = `rgba(255,255,255,${.8 * a})`; ctx.fill();
        ctx.restore();
      }
      if (t < duration) requestAnimationFrame(step); else { ctx.clearRect(0, 0, w, h); resolve(); }
    };
    requestAnimationFrame(step);
  });
}

/* ------------------------------------------------------- open / close ------- */
const anim = (el, frames, options) => (reduced.matches || !el?.animate) ? Promise.resolve() : el.animate(frames, { fill: 'both', ...options }).finished.catch(() => {});
const settle = els => els.forEach(el => el?.getAnimations?.().forEach(a => a.cancel()));

async function openHighlights() {
  if (open || busy) return;
  if (!root) build();
  busy = true; open = true;
  const landing = $('#landing'), media = $('#landing .landing-media'), copy = $('#landing .landing-copy');
  landing?.scrollIntoView({ block: 'start', behavior: 'instant' });
  document.documentElement.classList.add('eb-open');
  root.hidden = false;
  root.classList.add('is-entering');
  scroller.scrollTop = 0; lastScroll = 0; velocity = 0; scrollTarget = scrollCurrent = 0; wheelActive = false;
  cards.forEach(c => { c.depth = 0; c.fAlpha = 1; c.tweens = []; });
  requestAnimationFrame(drawLabels);
  flakes = []; shake.raw = shake.s = shake.v = 0; shake.lastX = null;
  pointer.x = pointer.tx; pointer.y = pointer.ty;
  if (!raf) raf = requestAnimationFrame(frame);
  underwaterPlunge();
  // The camera drops: the landing scene rises out of frame as the studio comes up from below.
  const fromMedia = media ? getComputedStyle(media).transform : 'none';
  const drop = [
    anim(media, [{ transform: fromMedia, filter: 'brightness(1) blur(0px)' }, { transform: 'translate3d(0,-42vh,0) scale(1.16)', filter: 'brightness(1.25) blur(4px)' }], { duration: 1400, easing: EASE_IN_OUT }),
    anim(copy, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -34vh' }], { duration: 1100, easing: EASE_IN_OUT }),
    anim(stage, [{ transform: 'translate3d(0,100%,0)', borderRadius: '50% 50% 0 0 / 16vh 16vh 0 0' }, { transform: 'translate3d(0,0,0)', borderRadius: '0 0 0 0 / 0 0 0 0' }], { duration: 1400, delay: 320, easing: EASE_IN_OUT }),
    anim($('.eb-water', root), [{ opacity: 0 }, { opacity: 1, offset: .35 }, { opacity: .85, offset: .6 }, { opacity: 0 }], { duration: 2100, easing: 'linear' }),
    bubbles(2600),
  ];
  await new Promise(r => setTimeout(r, reduced.matches ? 0 : 850));
  root.classList.remove('is-entering');
  const title = root.querySelectorAll('.eb-title > span'), pills = root.querySelectorAll('.eb-pill'), shown = cards.filter(c => c.shown).map(c => c.el);
  const rise = [
    ...[...title].map((el, i) => anim(el, [{ opacity: 0, transform: 'translateY(80%)' }, { opacity: 1, transform: 'none' }], { duration: 1100, delay: 350 + i * 90, easing: EASE_OUT })),
    anim($('.eb-filters', root), [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: 700, delay: 520, easing: EASE_OUT }),
    ...[...pills].map((el, i) => anim(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 600 + i * 55, easing: EASE_OUT })),
    ...shown.map((el, i) => anim(el, [{ opacity: 0, transform: 'translateY(46vh)' }, { opacity: 1, transform: 'none' }], { duration: 1500, delay: 380 + i * 85, easing: 'cubic-bezier(.16,1,.3,1)' })),
    anim($('.eb-close', root), [{ opacity: 0, transform: 'scale(.6) rotate(-90deg)' }, { opacity: 1, transform: 'none' }], { duration: 800, delay: 700, easing: EASE_OUT }),
  ];
  $('.eb-close', root).focus({ preventScroll: true });
  await Promise.all([...drop, ...rise]);
  settle([...title, ...pills, $('.eb-filters', root), ...shown, stage, media, copy, $('.eb-close', root), $('.eb-water', root)]);
  busy = false;
}

async function close(then) {
  if (!open || busy) return;
  busy = true;
  const shown = cards.filter(c => c.shown).map(c => c.el), media = $('#landing .landing-media'), copy = $('#landing .landing-copy');
  const out = [
    anim($('.eb-head', root), [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-30px)' }], { duration: 500, easing: 'cubic-bezier(.4,0,.2,1)' }),
    ...shown.map((el, i) => anim(el, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(12vh)' }], { duration: 600, delay: i * 30, easing: 'cubic-bezier(.4,0,.2,1)' })),
    anim(stage, [{ transform: 'translate3d(0,0,0)', borderRadius: '0 0 0 0 / 0 0 0 0' }, { transform: 'translate3d(0,100%,0)', borderRadius: '50% 50% 0 0 / 16vh 16vh 0 0' }], { duration: 1200, delay: 200, easing: EASE_IN_OUT }),
  ];
  if (!then) {
    out.push(anim(media, [{ transform: 'translate3d(0,-42vh,0) scale(1.16)', filter: 'brightness(1.25) blur(4px)' }, { transform: getComputedStyle(media).transform === 'none' ? 'none' : getComputedStyle(media).transform, filter: 'brightness(1) blur(0px)' }], { duration: 1300, delay: 250, easing: EASE_IN_OUT }));
    out.push(anim(copy, [{ opacity: 0, translate: '0 -34vh' }, { opacity: 1, translate: '0 0' }], { duration: 1100, delay: 450, easing: EASE_IN_OUT }));
  } else {
    out.push(anim(root, [{ opacity: 1 }, { opacity: 0 }], { duration: 500, delay: 900 }));
  }
  await Promise.all(out);
  open = false;
  root.hidden = true;
  settle([root, stage, $('.eb-head', root), ...shown, media, copy]);
  document.documentElement.classList.remove('eb-open');
  busy = false;
  if (then) then(); else $('.landing-primary')?.focus({ preventScroll: true });
}

let filtering = 0;
function filter(group) {
  root.querySelectorAll('.eb-pill').forEach(p => p.setAttribute('aria-pressed', String(p.dataset.group === group)));
  const run = ++filtering;
  const apply = () => {
    if (run !== filtering) return;
    cards.forEach((c, i) => { c.shown = group === 'All' || ITEMS[i].group === group; c.el.hidden = !c.shown; });
    wheelActive = false; scroller.scrollTop = scrollTarget = scrollCurrent = 0;
    requestAnimationFrame(drawLabels);
    let n = 0;
    cards.forEach(c => { if (!c.shown) return; c.depth = 100; c.fAlpha = 0; tween(c, 'depth', 0, .5, .035 * n); tween(c, 'fAlpha', 1, .5, .035 * n); n++; });
  };
  if (!gl || reduced.matches) { apply(); cards.forEach(c => { c.depth = 0; c.fAlpha = 1; c.tweens = []; }); return; }
  let n = 0;
  cards.forEach(c => { if (!c.shown) return; tween(c, 'depth', -100, .5, .035 * n); tween(c, 'fAlpha', 0, .3, .035 * n); n++; });
  setTimeout(apply, (500 + 35 * Math.max(0, n - 1)));
}

async function choose(item) {
  if (item.go.film) {
    await close(() => document.dispatchEvent(new CustomEvent('esmi:landing-action', { detail: { action: 'film' } })));
    return;
  }
  // The assembly now lives on its own page; open it at this card's chapter.
  await close(() => { location.href = `./engineering.html#${encodeURIComponent(item.go.chapter)}`; });
}

document.addEventListener('esmi:landing-action', event => {
  if (event.detail?.action === 'eboats') openHighlights();
});
addEventListener('resize', () => { if (open && !raf) raf = requestAnimationFrame(frame); clearTimeout(drawLabels.t); drawLabels.t = setTimeout(drawLabels, 150); });
