// ESMI Inspect: the E-Boat as a real-time 3D model (exported from the Blender scene
// that renders the engineering frames). Drag to orbit, scroll/pinch or the +/− buttons
// to zoom, pick a camera view, and pull the boat apart with the slider (it scrubs the
// same assembly animation, backwards).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MODEL = './assets/inspect/esmi-eboat.glb';
const $ = s => document.querySelector(s);
const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
root.classList.add('ins-booted');
const canvas = $('.ins-canvas'), status = $('.ins-status'), statusText = $('.ins-status-text');
const explode = $('.ins-explode'), slider = $('.ins-explode input');

// Blender is Z-up with the camera side at -Y; glTF/three is Y-up: (x, y, z) → (x, z, -y).
const bl = (x, y, z) => new THREE.Vector3(x, z, -y);
const FLOOR = -1.07;

/* ------------------------------------------------------------ renderer ------ */
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;              // same view transform family as the Blender renders
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.75;

const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 200);
const key = new THREE.DirectionalLight(0xfff8f0, 2.4);
key.position.copy(bl(6.5, -7, 7));
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0004;
key.shadow.normalBias = 0.02;
Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 1, far: 30 });
scene.add(key);
scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9a98, 0.55));
const rim = new THREE.DirectionalLight(0xeef3ff, 0.9);
rim.position.copy(bl(-7, 6, 5));
scene.add(rim);

// Soft contact shadow on an invisible studio floor.
const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2;
ground.position.y = FLOOR;
ground.receiveShadow = true;
scene.add(ground);

const controls = new OrbitControls(camera, canvas);
Object.assign(controls, {
  enableDamping: true, dampingFactor: 0.08, rotateSpeed: 0.7, zoomSpeed: 0.9, panSpeed: 0.8,
  screenSpacePanning: true, zoomToCursor: true,
  minDistance: 1.1, maxDistance: 26, maxPolarAngle: Math.PI * 0.49,
});

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < 760 ? 44 : 32;                     // phones: wider lens so the boat fits the narrow screen
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------ views --------- */
const VIEWS = {
  bow:   { target: bl(2.3, -1.25, -0.35), position: bl(5.9, -4.3, 0.35) },
  helm:  { target: bl(1.45, 0.7, 0.8),    position: bl(3.8, -1.9, 1.95) },
  seats: { target: bl(-0.35, 0, 0.45),    position: bl(1.7, -3.5, 2.4) },
  solar: { target: bl(-0.3, 0, 2.3),      position: bl(2.7, -5.4, 6.6) },
  drive: { target: bl(-1.9, 0, -0.55),    position: bl(-5.8, -0.9, -0.15), explode: 0.45 },
};
let overview = null;
function fitOverview(object) {
  const box = new THREE.Box3().setFromObject(object), sphere = box.getBoundingSphere(new THREE.Sphere());
  const az = THREE.MathUtils.degToRad(-57), el = THREE.MathUtils.degToRad(18);
  const dir = bl(Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)).normalize();
  const fov = THREE.MathUtils.degToRad(camera.fov), fitH = sphere.radius / Math.sin(fov / 2);
  const fitW = sphere.radius / Math.sin(Math.atan(Math.tan(fov / 2) * camera.aspect));
  const distance = Math.max(fitH, fitW) * 0.92;
  const target = sphere.center.clone().add(new THREE.Vector3(0, -sphere.radius * 0.06, 0));
  overview = { target, position: target.clone().addScaledVector(dir, distance) };
  controls.maxDistance = distance * 2.2;
  VIEWS.overview = overview;
}

// Smooth camera moves (controls are paused while a move runs).
let flight = null;
function fly(to, duration = 1.15) {
  if (reduced.matches) duration = 0.01;
  flight = { from: { p: camera.position.clone(), t: controls.target.clone() }, to, start: performance.now(), duration: duration * 1000 };
  controls.enabled = false;
  if (typeof to.explode === 'number') setExplode(to.explode, true);
}
const easeInOut = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function stepFlight(now) {
  if (!flight) return;
  const k = Math.min(1, (now - flight.start) / flight.duration), e = easeInOut(k);
  camera.position.lerpVectors(flight.from.p, flight.to.position, e);
  controls.target.lerpVectors(flight.from.t, flight.to.target, e);
  if (k >= 1) { flight = null; controls.enabled = true; }
}

document.querySelectorAll('.ins-view').forEach(button => button.addEventListener('click', () => {
  const view = VIEWS[button.dataset.view];
  if (!view) return;
  document.querySelectorAll('.ins-view').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  if (button.dataset.view !== 'drive' && explodeTarget > 0.001 && button.dataset.view !== 'overview') setExplode(0, true);
  fly(view);
}));
function zoomBy(factor) {
  const offset = camera.position.clone().sub(controls.target);
  const distance = THREE.MathUtils.clamp(offset.length() * factor, controls.minDistance, controls.maxDistance);
  fly({ target: controls.target.clone(), position: controls.target.clone().add(offset.setLength(distance)) }, 0.5);
}
$('[data-zoom="in"]').addEventListener('click', () => zoomBy(0.72));
$('[data-zoom="out"]').addEventListener('click', () => zoomBy(1.38));
$('.ins-reset').addEventListener('click', () => {
  document.querySelectorAll('.ins-view').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === 'overview')));
  setExplode(0, true);
  if (overview) fly(overview);
});
controls.addEventListener('start', () => {
  flight = null;
  document.querySelectorAll('.ins-view').forEach(b => b.setAttribute('aria-pressed', 'false'));
});

/* ------------------------------------------------------------ explode ------- */
let mixer = null, tAssembled = 0, tExploded = 0, explodeNow = 0, explodeTarget = 0;
function setExplode(value, animate = false) {
  explodeTarget = THREE.MathUtils.clamp(value, 0, 1);
  if (!animate || reduced.matches) explodeNow = explodeTarget;
  slider.value = String(explodeTarget);
}
slider.addEventListener('input', () => { explodeTarget = explodeNow = Number(slider.value); });
function applyExplode() {
  if (!mixer) return;
  mixer.setTime(tAssembled - explodeNow * (tAssembled - tExploded));
}

/* ------------------------------------------------------------ load ---------- */
const loader = new GLTFLoader();
loader.load(MODEL, gltf => {
  const model = gltf.scene;
  model.traverse(node => {
    if (!node.isMesh) return;
    node.castShadow = true;
    node.receiveShadow = true;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(m => { if (m.map) m.map.anisotropy = renderer.capabilities.getMaxAnisotropy(); });
  });
  scene.add(model);
  if (gltf.animations.length) {
    mixer = new THREE.AnimationMixer(model);
    let tMin = Infinity, tMax = 0;
    gltf.animations.forEach(clip => {
      clip.tracks.forEach(track => { tMin = Math.min(tMin, track.times[0]); tMax = Math.max(tMax, track.times[track.times.length - 1]); });
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
    });
    // Frame 1 of the assembly is fully apart, the last frame fully assembled.
    tExploded = Number.isFinite(tMin) ? tMin : 0;
    tAssembled = tMax;
    applyExplode();
    explode.hidden = false;
  }
  fitOverview(model);
  camera.position.copy(overview.position);
  controls.target.copy(overview.target);
  // Arrive with a short dolly-in.
  camera.position.addScaledVector(camera.position.clone().sub(controls.target).normalize(), 1.6);
  fly(overview, 1.6);
  status.classList.add('is-done');
  root.classList.add('ins-ready');
}, event => {
  if (event.total) statusText.textContent = `Loading the model ${Math.round(event.loaded / event.total * 100)}%`;
}, error => {
  console.warn('[inspect] model failed to load', error);
  showFallback('The 3D model could not load. Showing a still of the boat.');
});

function showFallback(message) {
  $('.ins-fallback').hidden = false;
  canvas.hidden = true;
  statusText.textContent = message;
  document.querySelectorAll('.ins-views, .ins-tools').forEach(el => { el.hidden = true; });
}

/* ------------------------------------------------------------ cursor -------- */
const cursor = $('.ins-cursor');
const ring = { x: -100, y: -100, tx: -100, ty: -100, s: 1, ts: 1, seen: false };
let dragging = false;
addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse') return;
  if (!ring.seen) { ring.x = ring.tx = event.clientX; ring.y = ring.ty = event.clientY; ring.seen = true; }
  ring.tx = event.clientX; ring.ty = event.clientY;
  root.classList.add('ins-pointer');
  const control = event.target.closest?.('a, button, input');
  root.dataset.cursorMode = dragging ? 'drag' : control ? 'control' : 'scene';
  ring.ts = dragging ? 0.75 : control ? 1.55 : 1;
}, { passive: true });
canvas.addEventListener('pointerdown', () => { dragging = true; root.dataset.cursorMode = 'drag'; ring.ts = 0.75; });
addEventListener('pointerup', () => { dragging = false; root.dataset.cursorMode = 'scene'; ring.ts = 1; });
document.addEventListener('pointerleave', () => root.classList.remove('ins-pointer'));

/* ------------------------------------------------------------ loop ---------- */
const clock = new THREE.Clock();
function frame(now) {
  const dt = Math.min(0.05, clock.getDelta());
  stepFlight(now);
  if (Math.abs(explodeTarget - explodeNow) > 1e-4) explodeNow += (explodeTarget - explodeNow) * (1 - Math.exp(-dt / 0.28));
  applyExplode();
  controls.update();
  renderer.render(scene, camera);
  const follow = 1 - Math.exp(-dt / 0.045);
  ring.x += (ring.tx - ring.x) * follow; ring.y += (ring.ty - ring.y) * follow;
  ring.s += (ring.ts - ring.s) * (1 - Math.exp(-dt / 0.08));
  cursor.style.transform = `translate3d(${ring.x.toFixed(1)}px,${ring.y.toFixed(1)}px,0) scale(${ring.s.toFixed(3)})`;
}
renderer.setAnimationLoop(frame);
document.addEventListener('visibilitychange', () => renderer.setAnimationLoop(document.hidden ? null : frame));
