// Unseen-style "Film" transition. Clicking Film flies the camera into the
// ESMI helm, the console screen lights up with the film's first frame, then
// that screen grows to fill the view and hands over to the real film.
// With a generated fly-in clip configured it plays that clip; otherwise it
// pushes the camera into the helm of the live landing video.
const config = (() => { try { return JSON.parse(document.querySelector('#film-transition-config')?.textContent || '{}'); } catch { return {}; } })();
const landing = document.querySelector('#landing');
const landingVideo = document.querySelector('#landing-video');
const track = document.querySelector('#experience');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let running = null;
// Warm the fly-in clip after the landing has loaded, so Film starts instantly.
const flyCache = {};
function flyFor(kind) {
  const settings = {...(config.desktop || {}), ...(kind === 'portrait' ? config.portrait || {} : {})};
  if (!settings.src) return null;
  if (!flyCache[settings.src]) {
    const video = document.createElement('video');
    video.className = 'film-transit-fly'; video.muted = true; video.playsInline = true; video.preload = 'auto';
    video.src = settings.src; video.load();
    flyCache[settings.src] = video;
  }
  return flyCache[settings.src];
}
addEventListener('load', () => setTimeout(() => flyFor(variant()), 2500), {once:true});
const pace = () => Number(window.ESMI_TRANSITION_PACE) || 1; // >1 slows it down (testing)

const ease = {
  in: t => t * t * t,
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
};
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const span = (t, start, end) => clamp((t - start) / (end - start));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const frame = () => new Promise(requestAnimationFrame);
const variant = () => landing?.dataset.mediaVariant === 'portrait' ? 'portrait' : 'desktop';

// Map a point/rect given in a video's own frame (0–1) to viewport pixels,
// honouring object-fit:cover and the element's object-position.
function coverMap(element, width, height) {
  const box = element.getBoundingClientRect();
  const position = getComputedStyle(element).objectPosition.split(/\s+/).map(v => v.endsWith('%') ? parseFloat(v) / 100 : .5);
  const scale = Math.max(box.width / width, box.height / height);
  const w = width * scale, h = height * scale;
  const x0 = box.left + (box.width - w) * (position[0] ?? .5), y0 = box.top + (box.height - h) * (position[1] ?? .5);
  return (u, v) => [x0 + u * w, y0 + v * h];
}

function build(poster) {
  const root = document.createElement('div');
  root.className = 'film-transit';
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = `<div class="film-transit-glow"></div>
    <div class="film-transit-screen"><img alt="" src="${poster}"></div>
    <div class="film-transit-bezel"></div>
    <button type="button" class="film-transit-skip" tabindex="-1">Skip ↘</button>`;
  document.body.appendChild(root);
  return root;
}

// Screen rect morph: from a small rect (viewport px) to the full viewport.
function setScreen(screen, rect, grow, opacity) {
  const vw = innerWidth, vh = innerHeight;
  const [l, t, r, b] = rect;
  const inset = [t * (1 - grow), (vw - r) * (1 - grow), (vh - b) * (1 - grow), l * (1 - grow)];
  const radius = 10 * (1 - grow);
  screen.style.clipPath = `inset(${inset.map(v => v.toFixed(1) + 'px').join(' ')} round ${radius.toFixed(1)}px)`;
  screen.style.opacity = opacity.toFixed(3);
}

function setBezel(bezel, [l, t, r, b], opacity) {
  const pad = Math.max(3, (r - l) * .035);
  Object.assign(bezel.style, {left:`${l - pad}px`, top:`${t - pad}px`, width:`${r - l + pad * 2}px`, height:`${b - t + pad * 2}px`, borderWidth:`${pad}px`, borderRadius:`${pad * 2.2}px`, opacity:opacity.toFixed(3)});
}

async function handOff() {
  // Jump (under the cover) to the film stage, then let the site start the film.
  const top = track.offsetTop + (track.offsetHeight - innerHeight) * .982;
  scrollTo({top, behavior:'instant'});
  document.dispatchEvent(new CustomEvent('esmi:landing-action', {detail:{action:'film', direct:true}}));
  const started = performance.now();
  while (!document.body.classList.contains('is-film') && performance.now() - started < 3500) await frame();
  await wait(120);
}

// Hold the cursor-driven landing camera still while the transition runs.
function freezeCamera() {
  const layers = [...document.querySelectorAll('#landing .landing-media, #landing .landing-media > *')];
  layers.forEach(layer => layer.style.setProperty('transform', getComputedStyle(layer).transform, 'important'));
  return () => layers.forEach(layer => layer.style.removeProperty('transform'));
}

async function play() {
  const kind = variant();
  const settings = {...(config.desktop || {}), ...(kind === 'portrait' ? config.portrait || {} : {})};
  const poster = config.poster || './assets/v2/handoff.jpg';
  const root = build(poster);
  const fly = flyFor(kind) || Object.assign(document.createElement('video'), {className:'film-transit-fly', muted:true});
  root.prepend(fly);
  fly.style.opacity = '0';
  if (landingVideo) fly.style.objectPosition = getComputedStyle(landingVideo).objectPosition; // start exactly where the landing is framed
  const screen = root.querySelector('.film-transit-screen');
  const glow = root.querySelector('.film-transit-glow');
  const bezel = root.querySelector('.film-transit-bezel');
  let skip = false;
  root.addEventListener('click', () => { skip = true; });
  addEventListener('keydown', function onKey(event) { if (event.key === 'Escape') { skip = true; removeEventListener('keydown', onKey); } });
  document.body.classList.add('film-transit-active');
  const releaseCamera = freezeCamera();
  setScreen(screen, [innerWidth / 2, innerHeight / 2, innerWidth / 2, innerHeight / 2], 0, 0);
  await new Promise(resolve => { const img = screen.querySelector('img'); img.complete ? resolve() : (img.onload = img.onerror = resolve); });
  root.classList.add('is-on');

  let screenRect;
  if (settings.src) {
    // Generated fly-in: play it, then light up the console screen it ends on.
    try {
      if (fly.currentTime > 0) fly.currentTime = 0;
      if (fly.readyState < 2 || fly.seeking) await new Promise((resolve, reject) => {
        const done = () => { if (fly.readyState >= 2 && !fly.seeking) resolve(); };
        ['loadeddata', 'canplay', 'seeked'].forEach(type => fly.addEventListener(type, done));
        fly.addEventListener('error', reject, {once:true});
        setTimeout(() => reject(new Error('fly-in clip did not load in time')), 8000);
        done();
      });
      fly.style.opacity = '1';
      fly.playbackRate = Number(config.flySpeed) || 1.4; // fly-in plays 40% faster (about 4.3 s)
      await fly.play();
      while (!skip && !fly.ended) await frame();
      fly.pause();
      const map = coverMap(fly, fly.videoWidth, fly.videoHeight);
      const [x0, y0, x1, y1] = settings.screen || [.4, .35, .6, .5];
      screenRect = [...map(x0, y0), ...map(x1, y1)];
      for (let t = 0; t < 1 && !skip; t = clamp(t + .14)) { setScreen(screen, screenRect, 0, t); await frame(); }
    } catch (error) { console.warn('[film-transition] fly-in unavailable, using push-in', error); settings.src = ''; fly.style.opacity = '0'; }
  }
  if (!settings.src) {
    // Push-in fallback on the live landing video, centred on the helm.
    const map = coverMap(landingVideo, landingVideo.videoWidth || 1920, landingVideo.videoHeight || 1080);
    const [cx, cy] = map(...(settings.console || [.8, .71]));
    landing.classList.add('film-transit-zooming');
    landing.style.transformOrigin = `${cx}px ${cy}px`;
    const start = performance.now(), duration = 1100 * pace();
    const base = Math.min(innerWidth, innerHeight) * .022; // helm screen half-width before zoom
    const dx = innerWidth / 2 - cx, dy = innerHeight / 2 - cy; // swing the helm to the centre
    for (;;) {
      const t = skip ? 1 : clamp((performance.now() - start) / duration);
      const push = ease.in(t), swing = ease.inOut(t);
      const zoom = 1 + 7 * push;
      landing.style.transform = `translate(${(dx * swing).toFixed(2)}px, ${(dy * swing).toFixed(2)}px) scale(${zoom.toFixed(4)})`;
      landing.style.filter = `blur(${(4 * ease.in(span(t, .5, 1))).toFixed(2)}px) brightness(${(1 + .18 * span(t, .6, 1)).toFixed(3)})`;
      const sx = cx + dx * swing, sy = cy + dy * swing, half = base * zoom;
      const rect = [sx - half, sy - half * .5625, sx + half, sy + half * .5625];
      const shown = ease.out(span(t, .4, .75));
      setScreen(screen, rect, 0, shown);
      setBezel(bezel, rect, shown);
      glow.style.setProperty('--ft-x', `${sx}px`); glow.style.setProperty('--ft-y', `${sy}px`);
      glow.style.opacity = (.7 * Math.sin(Math.PI * span(t, .4, 1))).toFixed(3);
      screenRect = rect;
      if (t >= 1) break;
      await frame();
    }
  }

  // The screen grows to fill the view: we are now "inside" the film.
  const start = performance.now(), duration = skip ? 1 : 600 * pace();
  for (;;) {
    const t = clamp((performance.now() - start) / duration);
    const grow = ease.inOut(t);
    setScreen(screen, screenRect, grow, 1);
    setBezel(bezel, screenRect.map((v, i) => v + ([0, 0, innerWidth, innerHeight][i] - v) * grow), 1 - span(t, 0, .6));
    glow.style.opacity = '0';
    if (t >= 1) break;
    await frame();
  }
  fly.style.opacity = '0';
  await handOff();
  landing.classList.remove('film-transit-zooming');
  landing.style.transform = landing.style.filter = landing.style.transformOrigin = '';
  releaseCamera();
  document.body.classList.remove('film-transit-active');
  await root.animate([{opacity:1}, {opacity:0}], {duration:400, easing:'ease-out', fill:'forwards'}).finished;
  root.remove();
}

document.addEventListener('esmi:landing-action', event => {
  const detail = event.detail || {};
  if (detail.action !== 'film' || detail.direct || reduced.matches || !landing || !track) return;
  const box = landing.getBoundingClientRect();
  if (box.bottom < innerHeight * .5) return; // only when leaving from the landing view
  event.stopImmediatePropagation();
  if (running) return;
  running = play().catch(() => {
    document.body.classList.remove('film-transit-active');
    landing.style.transform = landing.style.filter = '';
    document.querySelectorAll('#landing .landing-media, #landing .landing-media > *').forEach(layer => layer.style.removeProperty('transform'));
    document.querySelector('.film-transit')?.remove();
    document.dispatchEvent(new CustomEvent('esmi:landing-action', {detail:{action:'film', direct:true}}));
  }).finally(() => { running = null; });
}, true);
