import { STORY, clamp, storyAt, chapterCenter, mediaRect } from './timeline.js';

const $ = selector => document.querySelector(selector);
// Which page this is: 'film' (landing + film, index.html), 'engineering' (the
// scroll assembly, engineering.html), or 'all' (both in one scroll, the old layout).
const PAGE = document.documentElement.dataset.page || 'all';
const ENGINEERING_URL = './engineering.html';
const FILM_URL = './#film';
function leaveTo(url) {
  // A short fade so the page change reads as a transition, not a cut.
  if (reduced.matches || !document.body.animate) { location.href = url; return; }
  document.body.animate([{opacity:1},{opacity:0}],{duration:320,easing:'ease-in',fill:'forwards'}).finished.then(()=>{location.href = url;});
}
const track = $('#experience');
const stage = $('#stage');
const canvas = $('#assembly-canvas');
const context = canvas.getContext('2d', { alpha: false });
const film = $('#cinematic-video');
const loading = $('#loading-status');
const status = $('#film-status');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let chapterButtons = [...document.querySelectorAll('[data-chapter]')];
const sample = document.createElement('canvas');
sample.width = sample.height = 1;
const sampleContext = sample.getContext('2d', {willReadFrequently:true});

const legacyChapters = [
  { title: 'A beginning<br><em>with balance.</em>', label: '01 / THE TWIN HULLS', copy: 'Two silver hulls, grounded in charcoal. The unmistakable catamaran foundation of the ESMI E-Boat.', material: 'SILVER TOPSIDES / CHARCOAL LOWER HULLS' },
  { title: 'A place<br><em>to come together.</em>', label: '02 / THE DECK', copy: 'An open platform bridges the two hulls, bringing the passenger space and steering console together.', material: 'OPEN DECK / LOW PERIMETER RAILS' },
  { title: 'Purpose,<br><em>in every line.</em>', label: '03 / THE ALUMINUM FRAME', copy: 'Angled aluminum uprights and roof braces form the light, open structure beneath the solar canopy.', material: 'SATIN ALUMINUM / EXPOSED CONNECTIONS' },
  { title: 'Good company.<br><em>A better view.</em>', label: '04 / THE PASSENGER SEATS', copy: 'Gray padded seats and dark armrests settle into place. Open sides keep every passenger close to the water.', material: 'GRAY CUSHIONS / DARK SEAT BASES' },
  { title: 'The journey,<br><em>in your hands.</em>', label: '05 / THE HELM', copy: 'A compact white console, black steering wheel and tinted windscreen. Finished with the familiar ESMI mark.', material: 'BRANDED CONSOLE / BLACK STEERING WHEEL' },
  { title: 'Bring the sun<br><em>aboard.</em>', label: '06 / THE SOLAR CANOPY', copy: 'The broad navy photovoltaic roof completes the boat. Shade above the passengers. Solar collection above it all.', material: 'NAVY SOLAR CELLS / SILVER PERIMETER' },
];

const internalChapters = [
  legacyChapters[0],
  {title:'Motion begins<br><em>within.</em>',label:'02 / THE ELECTRIC DRIVE',copy:'A compact electric motor and drive assembly settle into the stern, forming the illustrated propulsion system beneath the passenger deck.',material:'ELECTRIC MOTOR / DRIVE ASSEMBLY',nav:'Drive',illustrative:true},
  {title:'Energy,<br><em>in its place.</em>',label:'03 / THE BATTERY PACK',copy:'The battery pack moves into its protected under-deck position, bringing the illustrated energy-storage system aboard.',material:'BATTERY MODULE / UNDER-DECK ENCLOSURE',nav:'Battery',illustrative:true},
  {title:'Every connection<br><em>comes together.</em>',label:'04 / THE ELECTRICAL SYSTEM',copy:'The controller, distribution box and cable looms move into place, connecting the illustrated battery, drive and solar system.',material:'CONTROLLER / POWER DISTRIBUTION / WIRING',nav:'Wiring',illustrative:true},
  {...legacyChapters[1],label:'05 / THE DECK'},
  {...legacyChapters[2],label:'06 / THE ALUMINUM FRAME'},
  {...legacyChapters[3],label:'07 / THE PASSENGER SEATS'},
  {...legacyChapters[4],label:'08 / THE HELM'},
  {...legacyChapters[5],label:'09 / THE SOLAR CANOPY'},
];
const legacyFilmCues = [
  {start:0,eyebrow:'FROM THE STUDIO TO THE SEA',title:'A new horizon.<br><em>The same ESMI.</em>',copy:'The scene changes. The journey begins.'},
  {start:7.33,eyebrow:'THE ELECTRIC JOURNEY',title:'Good company.<br><em>Open horizons.</em>',copy:'A little closer to the water. A little further from the everyday.'},
  {start:14.67,eyebrow:'THE SOLAR CANOPY',title:'Let the sunlight<br><em>do its work.</em>',copy:'Solar collection, above every journey.'},
  {start:22,eyebrow:'AT THE DOCK',title:'Even at rest,<br><em>possibilities.</em>',copy:'A moment in the sun before the next journey.'},
];
const advertisementCues = [
  {...legacyFilmCues[0],start:0},
  {...legacyFilmCues[1],start:7},
  {...legacyFilmCues[2],start:14},
  {...legacyFilmCues[3],start:21},
  {start:28,eyebrow:'A DIFFERENT PERSPECTIVE',title:'The coast,<br><em>a little closer.</em>',copy:'Open water. New possibilities.'},
  {start:35,eyebrow:'COLLECTING THE DAY',title:'Made for sunlight.<br><em>Ready for tomorrow.</em>',copy:'Solar collection continues between journeys.'},
  {start:42,eyebrow:'ESMI / SOLAR ELECTRIC MARINE',title:'From the sun.<br><em>To the sea.</em>',copy:'A different way to move.'},
];
let chapters = legacyChapters;
let filmConfig = {src:'./assets/esmi-film.mp4',poster:'./assets/handoff.jpg',duration:30,oceanAt:2.55,hasAudio:false,cues:legacyFilmCues};
const timeLabel = seconds => {
  const time = Math.max(0,Math.floor(Number(seconds)||0));
  return `${String(Math.floor(time/60)).padStart(2,'0')}:${String(time%60).padStart(2,'0')}`;
};
function configureExperience(data) {
  const defaults = data.internalLayout ? internalChapters : legacyChapters;
  const configured = Array.isArray(data.chapters) && data.chapters.length ? data.chapters : defaults;
  chapters = configured.map((chapter,index)=>({
    ...defaults[Math.min(index,defaults.length-1)],...chapter,
    title:chapter.title ?? chapter.titleHTML ?? defaults[Math.min(index,defaults.length-1)].title,
    start:Number(chapter.start ?? index/configured.length),
    end:Number(chapter.end ?? configured[index+1]?.start ?? (index+1)/configured.length),
  }));
  const configuredFilm = data.film || {};
  filmConfig = {...filmConfig,...configuredFilm};
  if (!configuredFilm.cues?.length) filmConfig.cues = filmConfig.duration > 30 ? advertisementCues : legacyFilmCues;
  filmConfig.cues = filmConfig.cues.map(cue=>({...cue,title:cue.title ?? cue.titleHTML ?? ''}));
  document.dispatchEvent(new CustomEvent('esmi:film-config',{detail:{...filmConfig}}));
  window.ESMI_FILM_CONFIG = {...filmConfig};
  $('#film-seek').max = String(filmConfig.duration);
  $('#film-end-time').textContent = timeLabel(filmConfig.duration);
  $('#sound-toggle').hidden = !filmConfig.hasAudio;
  if (configuredFilm.src && PAGE !== 'engineering') {
    film.querySelector('source').src = configuredFilm.src;
    film.poster = configuredFilm.poster || data.poster || filmConfig.poster;
    film.load();
  }
  const navigation = $('#stage-navigation');
  navigation.replaceChildren(...chapters.map((chapter,index)=>{
    const button = document.createElement('button');
    button.dataset.chapter = String(index);
    button.setAttribute('aria-label',chapter.nav || chapter.label.replace(/^\d+\s*\/\s*/,''));
    button.setAttribute('aria-current',index === 0 ? 'step' : 'false');
    const number = document.createElement('span');
    number.textContent = String(index+1).padStart(2,'0');
    const name = document.createElement('span');
    const legacyNames = ['Hull','Deck','Frame','Seating','Helm','Solar'];
    const internalNames = ['Hull','Drive','Battery','Wiring','Deck','Frame','Seating','Helm','Solar'];
    name.textContent = chapter.nav || (data.internalLayout ? internalNames[index] : legacyNames[index]) || chapter.label.split('/').at(-1).trim();
    button.append(number,name);
    button.addEventListener('click',()=>gotoProgress(STORY.begin+(STORY.assembled-STORY.begin)*chapterCenter(index,chapters)));
    return button;
  }));
  chapterButtons = [...navigation.children];
  $('.story-progress').classList.toggle('has-internal-chapters',chapters.length > legacyChapters.length);
  if (data.frames?.[0]) canvas.style.backgroundImage = `url(${JSON.stringify(data.frames[0])})`;
  stage.dataset.sourceDimensions = `${data.width}x${data.height}`;
  stage.dataset.filmDuration = String(filmConfig.duration);
}

let manifest;
let currentFrame = null;
let frameIndex = -1;
let targetFrame = 0;
let selectedChapter = -1;
let mode = 'intro';
let width = 1, height = 1, dpr = 1;
let scrollProgress = 0;
let drawScheduled = false;
let startTimer;
let filmWasRequested = false;
let explicitPlay = false;
let movieFrameCallback = 0;
let movieRaf = 0;
let handoff;
let failedFrames = 0;
let renderToken = 0;
let sceneColor = '#e5e5e3';
let completeCopy = false;
let lastFilmChapter = -1;
let lastFilmSecond = -1;
let lastBackdropTime = -10;
let filmBufferingRequested = false;
let filmBlendStart = 0;
const backdropColors = new WeakMap();
const cache = new Map();

function imageAt(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Image could not load: ${path}`));
    image.src = path;
  });
}

function trimCache() {
  // 1080p decoded frames are large: bound the working set on every device.
  const limit = matchMedia('(max-width:760px)').matches ? 6 : 10;
  if (cache.size <= limit) return;
  const candidates = [...cache.keys()].sort((a,b) => Math.abs(b-targetFrame)-Math.abs(a-targetFrame));
  for (const index of candidates) {
    if (cache.size <= limit) break;
    if (index !== targetFrame && index !== frameIndex) cache.delete(index);
  }
}
function loadFrame(index) {
  index = clamp(index, 0, manifest.frames.length - 1);
  if (!cache.has(index)) {
    const pending = imageAt(manifest.frames[index]);
    cache.set(index, pending);
    pending.catch(() => cache.delete(index));
  }
  trimCache();
  return cache.get(index);
}
async function showFrame(index) {
  if (!manifest || mode === 'film') return;
  targetFrame = index;
  const token = ++renderToken;
  try {
    const image = index === manifest.frames.length - 1 ? handoff : await loadFrame(index);
    if (token !== renderToken || mode === 'film') return;
    const direction = index >= frameIndex ? 1 : -1;
    currentFrame = image;
    frameIndex = index;
    loading.hidden = true;
    stage.dataset.frame = String(index);
    queueDraw();
    for (const offset of [-1, 1, 2, 3]) {
      const next = clamp(index + offset * direction, 0, manifest.frames.length - 1);
      loadFrame(next).catch(() => {});
    }
  } catch (error) {
    failedFrames++;
    if (failedFrames === 1) console.warn(error.message);
    loading.textContent = 'A frame could not load. Scroll again to retry.';
    loading.hidden = false;
    loading.style.opacity = '1';
  }
}

function sourceColor(source) {
  if (source !== film && backdropColors.has(source)) return backdropColors.get(source);
  if (source === film && Math.abs(film.currentTime-lastBackdropTime)<.25) return sceneColor;
  try {
    sampleContext.drawImage(source, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r,g,b] = sampleContext.getImageData(0,0,1,1).data;
    const color = `rgb(${r},${g},${b})`;
    if (source === film) lastBackdropTime = film.currentTime;
    else backdropColors.set(source,color);
    return color;
  } catch { return sceneColor; }
}
function drawSource(source) {
  if (!source) return;
  const studioProgress = manifest?.internalLayout && mode !== 'film' ? Number(stage.dataset.assembly || 0) : 1;
  const sourceW = (mode === 'film' ? source.videoWidth : 0) || manifest?.width || source.videoWidth || source.naturalWidth || 16;
  const sourceH = (mode === 'film' ? source.videoHeight : 0) || manifest?.height || source.videoHeight || source.naturalHeight || 9;
  // Fullscreen advertisement: the film fills the stage edge to edge (cover).
  const cover = mode === 'film' && filmConfig.fullscreen ? Math.max(width / sourceW, height / sourceH) : 0;
  const rect = cover ? {x:(width - sourceW * cover) / 2, y:(height - sourceH * cover) / 2, width:sourceW * cover, height:sourceH * cover}
    : mediaRect(width,height,manifest?.width || source.videoWidth || source.naturalWidth || 16,manifest?.height || source.videoHeight || source.naturalHeight || 9,studioProgress);
  const settle = clamp((studioProgress-.9)/.1);
  const studioMix = 1-settle*settle*(3-2*settle);
  sceneColor = sourceColor(source);
  context.setTransform(dpr,0,0,dpr,0,0);
  context.fillStyle = '#f5f3ee';
  context.fillRect(0,0,width,height);
  context.globalAlpha = 1-studioMix;
  context.fillStyle = sceneColor;
  context.fillRect(0,0,width,height);
  context.globalAlpha = 1;
  context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  // Dissolve from the last rendered assembly frame into the opening of the film.
  if (mode === 'film' && source === film && handoff && filmBlendStart) {
    const fade = 1 - clamp((performance.now() - filmBlendStart) / 900);
    if (fade > 0) {
      const still = mediaRect(width,height,manifest?.width || 16,manifest?.height || 9,1);
      context.globalAlpha = fade;
      context.drawImage(handoff, still.x, still.y, still.width, still.height);
      context.globalAlpha = 1;
      if (film.paused) requestAnimationFrame(()=>drawSource(film));
    } else filmBlendStart = 0;
  }
  if (studioMix > 0) {
    // Feather the empty studio margins, keeping every physical part untouched.
    const featherX=rect.width*.045,featherY=rect.height*.045;
    const strips=[
      [rect.x,rect.y,rect.x+featherX,rect.y,rect.x,rect.y,featherX,rect.height],
      [rect.x+rect.width,rect.y,rect.x+rect.width-featherX,rect.y,rect.x+rect.width-featherX,rect.y,featherX,rect.height],
      [rect.x,rect.y,rect.x,rect.y+featherY,rect.x,rect.y,rect.width,featherY],
      [rect.x,rect.y+rect.height,rect.x,rect.y+rect.height-featherY,rect.x,rect.y+rect.height-featherY,rect.width,featherY],
    ];
    context.globalAlpha=studioMix;
    for (const [x0,y0,x1,y1,x,y,w,h] of strips) {
      const gradient=context.createLinearGradient(x0,y0,x1,y1);
      gradient.addColorStop(0,'#f5f3ee');gradient.addColorStop(1,'#f5f3ee00');
      context.fillStyle=gradient;context.fillRect(x,y,w,h);
    }
    context.globalAlpha=1;
  }
  stage.dataset.mediaRect = [rect.x,rect.y,rect.width,rect.height].map(n=>n.toFixed(2)).join(',');
}
function draw() {
  drawScheduled = false;
  drawSource(mode === 'film' && film.readyState >= 2 ? film : currentFrame);
}
function queueDraw() {
  if (!drawScheduled) { drawScheduled = true; requestAnimationFrame(draw); }
}
function resize() {
  width = stage.clientWidth; height = stage.clientHeight;
  dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
  context.fillStyle = '#f5f3ee';
  context.fillRect(0,0,canvas.width,canvas.height);
  queueDraw();
}
new ResizeObserver(resize).observe(stage);

function keepActiveChapterVisible() {
  if (!matchMedia('(max-width:760px)').matches) return;
  const navigation = $('#stage-navigation');
  const button = chapterButtons[selectedChapter];
  if (!button || navigation.scrollWidth <= navigation.clientWidth) return;
  const rail = navigation.getBoundingClientRect();
  const target = button.getBoundingClientRect();
  let delta = 0;
  if (target.left < rail.left + 4) delta = target.left - rail.left - 4;
  else if (target.right > rail.right - 4) delta = target.right - rail.right + 4;
  if (Math.abs(delta) > 1) {
    // Move only the chapter rail. scrollIntoView could move the entire story.
    navigation.scrollTo({left:navigation.scrollLeft+delta,behavior:reduced.matches ? 'instant' : 'smooth'});
  }
}
function chapterAt(index) {
  if (selectedChapter === index) return;
  selectedChapter = index;
  const chapter = chapters[index];
  $('#chapter-eyebrow').textContent = chapter.label;
  $('#chapter-title').innerHTML = chapter.title.replace(/<br\s*\/?>/g,' <br> ');
  $('#chapter-description').textContent = chapter.copy;
  $('#chapter-material').textContent = chapter.material;
  $('#internal-layout-note').hidden = !chapter.illustrative;
  stage.dataset.illustrativeInternals = String(Boolean(chapter.illustrative));
  $('#phase-label').textContent = chapter.label;
  chapterButtons.forEach((button,i) => button.setAttribute('aria-current', i===index ? 'step' : 'false'));
  keepActiveChapterVisible();
}
function setMode(next) {
  mode = next;
  stage.dataset.phase = next;
  document.body.classList.toggle('is-assembling', next === 'assembly');
  document.body.classList.toggle('is-film', next === 'film');
  $('#intro-copy').setAttribute('aria-hidden',String(next !== 'intro'));
  $('#intro-copy').inert = next !== 'intro';
  $('#chapter-copy').setAttribute('aria-hidden',String(next !== 'assembly'));
  $('#film-copy').setAttribute('aria-hidden',String(next !== 'film'));
  if (next === 'film') $('#film-copy').hidden = false;
  $('.scene-bottom').inert = next === 'film';
  canvas.setAttribute('aria-label',next === 'film' ? 'The ESMI E-Boat in a continuous cinematic journey from the studio to the ocean, with passengers, the solar canopy and a sunny dock.' : 'The ESMI solar catamaran, from separated components to the completed boat.');
  $('#film-controls').hidden = next !== 'film';
  $('#begin').hidden = next === 'film';
  if (next !== 'film') document.body.classList.remove('is-ocean');
}
function gotoProgress(value, smooth = true) {
  window.scrollTo({top:track.offsetTop + (track.offsetHeight-innerHeight)*value, behavior:smooth && !reduced.matches ? 'smooth' : 'instant'});
}
function stopMovie() {
  clearTimeout(startTimer);
  filmWasRequested = false;
  explicitPlay = false;
  film.pause();
  cancelMovieRender();
  if (film.readyState) film.currentTime = 0;
  status.textContent = '';
}

function updateFilmPage() {
  // Film page: the stage is a single screen. The film plays while the stage
  // fills the view and pauses when the visitor scrolls back up to the landing.
  if (!handoff) return;
  const box = track.getBoundingClientRect();
  const visible = box.top < innerHeight * .4 && box.bottom > innerHeight * .6;
  if (visible && !filmWasRequested) {
    filmWasRequested = true;
    clearTimeout(startTimer);
    if (reduced.matches && !explicitPlay) { status.textContent = 'Select Play film to begin.'; return; }
    if (film.currentTime > 0 && !film.ended) film.play().then(beginMovieRender).catch(()=>{});
    else startTimer = setTimeout(()=>startMovie(), 200);
  } else if (!visible && filmWasRequested) {
    clearTimeout(startTimer);
    filmWasRequested = false;
    film.pause();
    cancelMovieRender();
  }
}

function updateScroll() {
  if (PAGE === 'film') { updateFilmPage(); return; }
  const range = Math.max(1, track.offsetHeight-innerHeight);
  scrollProgress = clamp((scrollY-track.offsetTop)/range);
  const state = storyAt(scrollProgress,manifest?.frames.length || 1,chapters);
  // The engineering page ends on the assembled boat; the film lives on its own page.
  if (PAGE === 'engineering' && state.phase === 'film') state.phase = 'assembly';
  if (PAGE !== 'engineering' && state.assembly >= .75 && !filmBufferingRequested) {
    // Let the browser buffer the film before the handoff. Do not copy the
    // movie into JavaScript memory or reload its already-open media source.
    film.preload = 'auto';
    filmBufferingRequested = true;
  }
  stage.dataset.assembly = state.assembly.toFixed(4);
  stage.style.setProperty('--assembly-copy-opacity',String(manifest?.internalLayout ? 1-clamp((state.assembly-.9)/.08) : 1));
  $('#progress-fill').style.width = `${state.assembly*100}%`;
  $('#progress-label').textContent = `${Math.round(state.assembly*100).toString().padStart(2,'0')}%`;
  if (mode === 'film' && scrollProgress < STORY.film-.018) stopMovie();
  if (mode === 'film' && scrollProgress >= STORY.film-.018) return;
  setMode(state.phase === 'intro' ? 'intro' : 'assembly');
  if (completeCopy && state.assembly < .999) selectedChapter = -1;
  chapterAt(state.chapter);
  completeCopy = state.assembly >= .999;
  if (PAGE === 'engineering') {
    // At the end of the assembly the main button leads on to the film page.
    const label = completeCopy ? 'Watch the film' : 'Scroll to assemble';
    if ($('#begin span').textContent !== label) {
      $('#begin span').textContent = label;
      $('#begin .pill-arrow').textContent = completeCopy ? '↗' : '↓';
    }
  }
  if (state.phase === 'intro') $('#phase-label').textContent = '01 / THE BEGINNING';
  if (state.assembly >= .999) {
    $('#phase-label').textContent = 'ASSEMBLY COMPLETE / READY FOR THE WATER';
    $('#chapter-title').innerHTML = 'One complete idea. <br> <em>Ready for the water.</em>';
    $('#chapter-description').textContent = PAGE === 'engineering'
      ? 'The engineering comes together. Watch it take to the water in the ESMI film.'
      : 'The engineering comes together. Keep scrolling and let the scene come to life.';
    $('#chapter-material').textContent = 'ESMI / SOLAR ELECTRIC CATAMARAN';
    $('#internal-layout-note').hidden = true;
  }
  // With the SVG assembly (svg-assembly.js) only the photographic handoff is needed, for the final crossfade.
  if (manifest && !manifest.svgAssembly) showFrame(state.frame);
  else if (manifest && state.assembly >= .9) showFrame(manifest.frames.length-1);
  if (state.phase === 'film' && !filmWasRequested && manifest) {
    filmWasRequested = true;
    // Allow the exact, lossless opening frame to settle before starting time.
    clearTimeout(startTimer);
    if (!reduced.matches || explicitPlay) startTimer = setTimeout(()=>startMovie(), 400);
    else { status.textContent = 'Your boat is ready. Select Watch the film to continue.'; }
  } else if (state.phase !== 'film') {
    clearTimeout(startTimer); filmWasRequested = false;
  }
}
let scrollPending = false;
window.addEventListener('scroll',()=>{
  if (!scrollPending) { scrollPending = true; requestAnimationFrame(()=>{scrollPending=false;updateScroll();}); }
},{passive:true});
window.addEventListener('resize',()=>{updateScroll();keepActiveChapterVisible();},{passive:true});

function cancelMovieRender() {
  if ('cancelVideoFrameCallback' in film && movieFrameCallback) film.cancelVideoFrameCallback(movieFrameCallback);
  cancelAnimationFrame(movieRaf);
  movieFrameCallback = movieRaf = 0;
}
function beginMovieRender() { cancelMovieRender(); renderMovie(); }
function renderMovie() {
  movieFrameCallback = movieRaf = 0;
  if (mode !== 'film') return;
  drawSource(film.readyState >= 2 ? film : handoff);
  updateMovieUI();
  if (film.paused || film.ended) return;
  if ('requestVideoFrameCallback' in film) movieFrameCallback = film.requestVideoFrameCallback(renderMovie);
  else movieRaf = requestAnimationFrame(renderMovie);
}
async function startMovie() {
  if ((PAGE !== 'film' && scrollProgress < STORY.film-.018) || !handoff) return;
  currentFrame = handoff;
  drawSource(handoff);
  ++renderToken;
  status.textContent = '';
  film.currentTime = 0;
  filmBlendStart = PAGE !== 'film' && manifest?.source === 'Blender' ? performance.now() : 0;
  setMode('film');
  lastFilmChapter = lastFilmSecond = -1;
  document.body.classList.remove('film-ended');
  try {
    await film.play();
    beginMovieRender();
  } catch {
    status.textContent = 'Press Play film to begin.';
    updateMovieUI();
    drawSource(handoff);
  }
}
function updateMovieUI() {
  if (mode !== 'film') return;
  const duration = Number(filmConfig.duration) || film.duration;
  const time = Math.min(film.currentTime || 0,duration);
  const paused = film.paused || film.ended;
  $('#play-pause span:first-child').textContent = paused ? 'Play film' : 'Pause film';
  $('#play-pause').setAttribute('aria-label', paused ? 'Play film' : 'Pause film');
  $('#play-pause .pause-symbol').textContent = paused ? '▶' : 'Ⅱ';
  if (Math.floor(time) !== lastFilmSecond) {
    lastFilmSecond = Math.floor(time);
    $('#film-time').textContent = timeLabel(lastFilmSecond);
  }
  $('#film-seek').value = String(time);
  $('#film-seek').setAttribute('aria-valuetext',`${time.toFixed(0)} of ${duration} seconds`);
  const hasEndcardTime = filmConfig.endcardAt !== null && filmConfig.endcardAt !== undefined && Number.isFinite(Number(filmConfig.endcardAt));
  const endcardVisible = hasEndcardTime && time >= Number(filmConfig.endcardAt);
  $('#film-copy').hidden = endcardVisible;
  $('#film-copy').setAttribute('aria-hidden',String(endcardVisible));
  // The first frames remain a white studio: typography follows the actual
  // environment instead of turning white before the ocean arrives.
  document.body.classList.toggle('is-ocean',time >= Number(filmConfig.oceanAt));
  const filmChapters = filmConfig.cues;
  let index = 0;
  for (let i=1;i<filmChapters.length;i++) { if (time < Number(filmChapters[i].start)) break;index=i; }
  if (index !== lastFilmChapter) {
    lastFilmChapter = index;
    const {eyebrow,title,copy} = filmChapters[index];
    $('#film-eyebrow').textContent = eyebrow;
    $('#film-title').innerHTML = title;
    $('#film-description').textContent = copy;
    $('#phase-label').textContent = `THE ESMI FILM / ${String(index+1).padStart(2,'0')}`;
  }
  stage.dataset.filmTime = time.toFixed(3);
  document.body.classList.toggle('film-ended', film.ended);
}
function begin() { if (PAGE === 'engineering' && completeCopy) { watchFilm(); return; } gotoProgress(Math.min(STORY.assembled, Math.max(scrollProgress+.13,STORY.begin+.035))); }
$('#begin').addEventListener('click',begin);
document.querySelectorAll('[data-begin]').forEach(button=>button.addEventListener('click',begin));
chapterButtons.forEach(button=>button.addEventListener('click',()=>gotoProgress(STORY.begin+(STORY.assembled-STORY.begin)*chapterCenter(Number(button.dataset.chapter),chapters))));
function watchFilm() {
  if (PAGE === 'engineering') { leaveTo(FILM_URL); return; }
  explicitPlay = true;
  if (PAGE === 'film') {
    window.scrollTo({top:track.offsetTop, behavior:'instant'});
    filmWasRequested = true;
    if (mode === 'film' && film.currentTime > 0) { film.currentTime = 0; film.play().then(beginMovieRender).catch(()=>{}); }
    else startMovie();
    return;
  }
  if (mode === 'film') { film.currentTime=0; film.play().then(beginMovieRender).catch(()=>{}); }
  else { gotoProgress(.982); if (scrollProgress >= STORY.film) startMovie(); }
}
$('#watch-film').addEventListener('click',watchFilm);
// engineering.html#Battery opens the scroll at that chapter (used by the highlight cards).
function gotoChapterFromHash() {
  if (location.hash.length < 2) return;
  const wanted = decodeURIComponent(location.hash.slice(1)).toLowerCase();
  const index = chapters.findIndex(chapter=>String(chapter.nav || '').toLowerCase() === wanted);
  if (index >= 0) gotoProgress(STORY.begin+(STORY.assembled-STORY.begin)*Math.min(.999,chapterCenter(index,chapters)+.02), false);
}
function restart(value=0) {
  if (PAGE === 'film') { leaveTo(ENGINEERING_URL); return; }
  stopMovie(); selectedChapter=-1; setMode('assembly');
  gotoProgress(value); updateScroll();
}
$('#restart').addEventListener('click',()=>restart());
document.querySelectorAll('[data-restart]').forEach(button=>button.addEventListener('click',()=>restart(STORY.begin+.02)));
$('#play-pause').addEventListener('click',()=>{
  status.textContent='';
  if (film.paused || film.ended) { if (film.ended) film.currentTime=0;film.play().then(beginMovieRender).catch(()=>{status.textContent='Video playback is unavailable.';}); }
  else { film.pause(); cancelMovieRender(); }
});
$('#replay').addEventListener('click',()=>{film.currentTime=0;film.play().then(beginMovieRender).catch(()=>{});});
function setFilmSound(enabled) {
  film.muted = !enabled;
  $('#sound-toggle').textContent = film.muted ? 'Sound off' : 'Sound on';
  $('#sound-toggle').setAttribute('aria-pressed',String(!film.muted));
}
$('#sound-toggle').addEventListener('click',()=>setFilmSound(film.muted));
document.addEventListener('esmi:landing-action',event=>{
  const detail = event.detail || {};
  if (detail.action === 'engineering') { if (PAGE === 'film') leaveTo(ENGINEERING_URL); else restart(STORY.begin+.001); }
  else if (detail.action === 'film') watchFilm();
  else if (detail.action === 'sound') setFilmSound(typeof detail.enabled === 'boolean' ? detail.enabled : film.muted);
});
$('#film-seek').addEventListener('input',event=>{film.currentTime=Number(event.target.value);});
film.addEventListener('seeked',()=>{if(mode==='film'){drawSource(film);updateMovieUI();}});
for (const event of ['timeupdate','play','pause','ended']) film.addEventListener(event,updateMovieUI);
film.addEventListener('error',()=>{status.textContent='The film could not load. Select Replay to retry.';});
document.addEventListener('visibilitychange',()=>{if(document.hidden)film.pause();});
film.addEventListener('pause',cancelMovieRender);
window.addEventListener('pagehide',()=>{film.pause();cancelAnimationFrame(movieRaf);});

try {
  let config = JSON.parse($('#experience-config')?.textContent || '{}');
  if (config.selector) {
    const selector = await fetch(config.selector);
    if (!selector.ok) throw new Error('The experience configuration is unavailable.');
    config = {...config,...await selector.json()};
  }
  const response = await fetch(config.manifest || './assets/assembly.json');
  if (!response.ok) throw new Error('The engineering sequence is unavailable.');
  manifest = await response.json();
  if (!Array.isArray(manifest.frames) || !manifest.frames.length) throw new Error('The engineering sequence is empty.');
  configureExperience(manifest);
  if (PAGE === 'film') {
    // The film page never shows the assembly: it opens on the film's own first frame.
    const poster = filmConfig.poster || manifest.film?.poster || manifest.handoff;
    handoff = currentFrame = await imageAt(poster);
    canvas.style.backgroundImage = `url(${JSON.stringify(poster)})`;
    setMode('film');
    resize();
    drawSource(handoff);
    updateMovieUI();
  } else {
    handoff = await imageAt(manifest.handoff || manifest.frames.at(-1));
    resize();
    await showFrame(storyAt(scrollProgress,manifest.frames.length,chapters).frame);
  }
  loading.hidden=true;
  document.body.classList.add('scene-ready');
  stage.dataset.ready='true';
  updateScroll();
  if (PAGE === 'film' && location.hash === '#film') watchFilm();
  if (PAGE === 'engineering') { gotoChapterFromHash(); addEventListener('hashchange',gotoChapterFromHash); }
} catch (error) {
  loading.textContent='The engineering sequence could not load. Refresh to retry.';
  console.warn(error.message);
}
updateScroll();
