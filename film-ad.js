// ESMI fullscreen advertisement layer: per-scene captions synced to the film,
// an animated ESMI logo outro and replay at the end.
const film = document.querySelector('#cinematic-video');
const stage = document.querySelector('#stage');
const html = document.documentElement;
if (film && stage) setup();

function setup() {
  const layer = document.createElement('div');
  layer.className = 'film-ad';
  layer.innerHTML = `
    <div class="film-ad-shade"></div>
    <div class="film-ad-caption" aria-live="polite"></div>
    <div class="film-ad-outro" aria-hidden="true">
      <div class="film-ad-logo">
        <img class="film-ad-mark" src="${new URL('./assets/film-v3/esmi-mark.svg?v=2', import.meta.url).href}" alt="">
        <div class="film-ad-word"><span>E</span><span>S</span><span>M</span><span>I</span></div>
      </div>
      <span class="film-ad-rule"></span>
      <p class="film-ad-tag">SOLAR · ELECTRIC · MARINE</p>
      <p class="film-ad-line2">From the sun. <em>To the sea.</em></p>
    </div>`;
  stage.appendChild(layer);
  // Load the Flow-derived artwork as inline paths for the wave animation.
  // The image and live wordmark above remain available if parsing fails.
  const logoReady = loadLogo(layer.querySelector('.film-ad-logo'));
  const captionBox = layer.querySelector('.film-ad-caption');

  let config = null, active = -2, raf = 0;
  const apply = detail => {
    config = detail || {};
    html.classList.toggle('film-fullscreen', Boolean(config.fullscreen));
    film.loop = Boolean(config.fullscreen); // seamless auto-loop
    active = -2;
  };
  if (window.ESMI_FILM_CONFIG) apply(window.ESMI_FILM_CONFIG);
  document.addEventListener('esmi:film-config', event => apply(event.detail));

  const captions = () => Array.isArray(config?.captions) ? config.captions : [];
  const outroAt = () => Number(config?.outroAt ?? Infinity);

  function render(index) {
    const old = captionBox.firstElementChild;
    if (old) { old.classList.remove('is-in'); old.classList.add('is-out'); setTimeout(() => old.remove(), 600); }
    const cue = captions()[index];
    layer.classList.toggle('has-caption', Boolean(cue));
    if (!cue) return;
    const card = document.createElement('div');
    card.className = 'film-ad-card';
    const lines = String(cue.title || '').split(/<br\s*\/?>/i).map(line => `<span class="film-ad-line"><span>${line}</span></span>`).join('');
    card.innerHTML = `<p class="film-ad-kicker"><i></i><span>${cue.kicker || ''}</span></p><h2 class="film-ad-title">${lines}</h2>${cue.sub ? `<p class="film-ad-sub">${cue.sub}</p>` : ''}`;
    captionBox.appendChild(card);
    requestAnimationFrame(() => requestAnimationFrame(() => card.classList.add('is-in')));
  }

  function tick() {
    raf = 0;
    if (!document.body.classList.contains('is-film') || !config?.fullscreen) { reset(); return; }
    const time = film.currentTime || 0;
    const outro = time >= outroAt() - 0.05;
    layer.classList.toggle('is-outro', outro);
    let index = -1;
    if (!outro) captions().forEach((cue, i) => { if (time >= cue.start && time < (cue.end ?? Infinity)) index = i; });
    if (index !== active) { active = index; render(index); }
    layer.classList.toggle('is-ended', film.ended);
    if (!film.paused && !film.ended) raf = requestAnimationFrame(tick);
  }
  function reset() { layer.classList.remove('is-outro', 'is-ended', 'has-caption'); if (active !== -2) { active = -2; captionBox.replaceChildren(); } }
  const wake = () => { if (!raf) raf = requestAnimationFrame(tick); };
  ['play', 'playing', 'seeked', 'timeupdate', 'ended', 'pause'].forEach(type => film.addEventListener(type, wake));
  new MutationObserver(wake).observe(document.body, {attributes:true, attributeFilter:['class']});

  // The advertisement loops: when it finishes it starts again from the top.
  film.addEventListener('ended', () => { if (config?.fullscreen && document.body.classList.contains('is-film')) document.querySelector('#replay')?.click(); });
  logoReady.finally(wake);
}

async function loadLogo(container) {
  try {
    const response = await fetch(new URL('./assets/film-v3/esmi-logo-light.svg?v=2', import.meta.url));
    if (!response.ok) throw new Error(`Logo returned ${response.status}`);
    const source = new DOMParser().parseFromString(await response.text(), 'image/svg+xml');
    const logo = source.documentElement;
    if (logo.localName !== 'svg' || source.querySelector('parsererror')) throw new Error('Invalid logo SVG');
    logo.classList.add('film-ad-lockup');
    logo.setAttribute('aria-hidden', 'true');
    logo.setAttribute('focusable', 'false');
    container.replaceChildren(document.importNode(logo, true));
  } catch (error) {
    console.warn('[film-ad] Using ESMI image lockup', error);
  }
}
