// Engineering page pointer effects, matching the landing (landing-effects.js):
// a fast ring cursor that grows over controls, magnetic buttons, and a camera
// that drifts toward the cursor on a critically damped spring.
const root = document.documentElement;
const media = document.querySelector('.media-stage');
const cursor = document.querySelector('.eng-cursor');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const CONTROLS = 'a, button';

const ring = { x: -100, y: -100, tx: -100, ty: -100, scale: 1, ts: 1, seen: false };
const view = { x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0 };
const magnets = new Map();
let active = null, raf = 0, last = 0;

function move(event) {
  if (event.pointerType !== 'mouse' || reduced.matches) return;
  if (!ring.seen) { ring.x = ring.tx = event.clientX; ring.y = ring.ty = event.clientY; ring.seen = true; }
  ring.tx = event.clientX; ring.ty = event.clientY;
  root.classList.add('eng-pointer');
  view.tx = Math.max(-1, Math.min(1, (event.clientX / innerWidth - .5) * 2));
  view.ty = Math.max(-1, Math.min(1, (event.clientY / innerHeight - .5) * 2));
  const control = event.target.closest?.(CONTROLS);
  ring.ts = control ? 1.55 : 1;
  root.dataset.cursorMode = control ? 'control' : 'scene';
  if (active && active.el !== control) { active.tx = active.ty = 0; active = null; }
  if (control && !control.closest('.eng-nav')) {
    if (!magnets.has(control)) magnets.set(control, { el: control, x: 0, y: 0, tx: 0, ty: 0 });
    active = magnets.get(control);
    const box = control.getBoundingClientRect();
    active.tx = Math.max(-5, Math.min(5, (event.clientX - (box.left + box.width / 2 - active.x)) * .18));
    active.ty = Math.max(-5, Math.min(5, (event.clientY - (box.top + box.height / 2 - active.y)) * .18));
  }
  wake();
}

function tick(now) {
  raf = 0;
  const dt = Math.min(.033, Math.max(.001, (now - (last || now - 16.7)) / 1000));
  last = now;
  // Ring: fast follow, ~90% of the gap closed in 0.1 s.
  const follow = 1 - Math.exp(-dt / .045);
  ring.x += (ring.tx - ring.x) * follow;
  ring.y += (ring.ty - ring.y) * follow;
  ring.scale += (ring.ts - ring.scale) * (1 - Math.exp(-dt / .08));
  if (cursor) cursor.style.transform = `translate3d(${ring.x.toFixed(1)}px,${ring.y.toFixed(1)}px,0) scale(${ring.scale.toFixed(3)})`;
  // Camera: critically damped spring, ~0.45 s to rest.
  const omega = 10;
  view.vx += ((view.tx - view.x) * omega * omega - view.vx * 2 * omega) * dt;
  view.vy += ((view.ty - view.y) * omega * omega - view.vy * 2 * omega) * dt;
  view.x += view.vx * dt; view.y += view.vy * dt;
  if (media) {
    media.style.setProperty('--eng-pan-x', `${(-view.x * innerWidth * .012).toFixed(2)}px`);
    media.style.setProperty('--eng-pan-y', `${(-view.y * innerHeight * .01).toFixed(2)}px`);
  }
  const ease = 1 - Math.exp(-dt / .24);
  let busy = false;
  magnets.forEach(m => {
    m.x += (m.tx - m.x) * ease; m.y += (m.ty - m.y) * ease;
    m.el.style.translate = `${m.x.toFixed(2)}px ${m.y.toFixed(2)}px`;
    if (Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y) > .03) busy = true;
  });
  const moving = busy || Math.hypot(ring.tx - ring.x, ring.ty - ring.y) > .1 || Math.abs(ring.ts - ring.scale) > .005 ||
    Math.abs(view.tx - view.x) + Math.abs(view.ty - view.y) > .0005 || Math.abs(view.vx) + Math.abs(view.vy) > .001;
  if (moving) raf = requestAnimationFrame(tick); else last = 0;
}
function wake() { if (!raf) raf = requestAnimationFrame(tick); }

addEventListener('pointermove', move, { passive: true });
document.addEventListener('pointerleave', () => { root.classList.remove('eng-pointer'); view.tx = view.ty = 0; wake(); });
addEventListener('blur', () => { root.classList.remove('eng-pointer'); });
