// Unseen-style text entrance for the landing headline. Each line is revealed
// left to right through a noisy dissolve edge while it comes into focus.
const SVG = 'http://www.w3.org/2000/svg';
const html = document.documentElement;
const copy = document.querySelector('.landing-copy');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const lines = [
  {selector:'.landing-eyebrow', delay:200, duration:1400, grain:0.09, blur:0.8},
  {selector:'.landing-title-serif', delay:520, duration:2000, grain:0.035, blur:2.5},
  {selector:'.landing-title-sans', delay:860, duration:2000, grain:0.032, blur:2.5},
];
const ramp = 'data:image/svg+xml,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 10' width='100' height='10' preserveAspectRatio='none'>" +
  "<defs><linearGradient id='g'><stop offset='0' stop-color='#000'/><stop offset='1' stop-color='#000' stop-opacity='0'/></linearGradient></defs>" +
  "<rect width='100' height='10' fill='url(#g)'/></svg>");

const node = (name, attrs, parent) => {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  parent?.appendChild(element);
  return element;
};
const easeOut = t => -(Math.cos(Math.PI * t) - 1) / 2; // steady sweep
const START = -1, END = 0.72; // dissolve threshold offset: hidden → fully shown

function reveal() {
  if (!copy || reduced) { html.classList.remove('landing-reveal-pending'); return; }
  const svg = node('svg', {class:'landing-reveal-filters', 'aria-hidden':'true', focusable:'false'});
  const defs = node('defs', {}, svg);
  const jobs = lines.map((line, index) => {
    const element = copy.querySelector(line.selector);
    if (!element) return null;
    const id = `esmi-reveal-${index}`;
    const filter = node('filter', {id, x:'-0.05', y:'-0.35', width:'1.1', height:'1.7', 'color-interpolation-filters':'sRGB'}, defs);
    node('feTurbulence', {type:'fractalNoise', baseFrequency:line.grain, numOctaves:'2', seed:String(7 + index * 13), result:'noise'}, filter);
    node('feColorMatrix', {in:'noise', type:'matrix', values:'0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0', result:'grain'}, filter);
    const image = node('feImage', {href:ramp, preserveAspectRatio:'none', result:'ramp'}, filter);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', ramp);
    const sum = node('feComposite', {in:'grain', in2:'ramp', operator:'arithmetic', k1:'0', k2:'0.35', k3:'1', k4:String(START), result:'field'}, filter);
    const threshold = node('feComponentTransfer', {in:'field', result:'mask'}, filter);
    node('feFuncA', {type:'linear', slope:'24', intercept:'-12'}, threshold);
    const soft = node('feGaussianBlur', {in:'SourceGraphic', stdDeviation:line.blur, result:'soft'}, filter);
    node('feComposite', {in:'soft', in2:'mask', operator:'in'}, filter);
    element.style.filter = `url(#${id})`;
    return {...line, element, sum, soft};
  }).filter(Boolean);
  document.body.appendChild(svg);
  html.classList.remove('landing-reveal-pending');

  const button = copy.querySelector('.landing-primary');
  button?.animate([{opacity:0, translate:'0 16px'}, {opacity:1, translate:'0 0'}],
    {duration:1000, delay:2100, easing:'cubic-bezier(.19,1,.22,1)', fill:'backwards'});

  const start = performance.now();
  const frame = now => {
    let running = false;
    for (const job of jobs) {
      if (job.done) continue;
      const t = Math.min(1, Math.max(0, (now - start - job.delay) / job.duration));
      const eased = easeOut(t);
      job.sum.setAttribute('k4', (START + (END - START) * eased).toFixed(4));
      job.soft.setAttribute('stdDeviation', (job.blur * (1 - eased)).toFixed(3));
      if (t >= 1) { job.done = true; job.element.style.filter = ''; }
      else running = true;
    }
    if (running) requestAnimationFrame(frame);
    else { svg.remove(); setupLiquidHover(); }
  };
  requestAnimationFrame(frame);
}

// Liquid cursor wake on the headline, like the Unseen hero: letters under a
// moving cursor bend and smear, then settle back when the cursor rests.
const lens = 'data:image/svg+xml,' + encodeURIComponent(
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' width='100' height='100'>" +
  "<defs><radialGradient id='r'><stop offset='0' stop-color='#fff'/><stop offset='.45' stop-color='#fff' stop-opacity='.75'/><stop offset='1' stop-color='#fff' stop-opacity='0'/></radialGradient></defs>" +
  "<circle cx='50' cy='50' r='50' fill='url(#r)'/></svg>");
const hoverLines = [
  {selector:'.landing-eyebrow', radius:3.2, strength:16, grain:0.03},
  {selector:'.landing-title-serif', radius:1.7, strength:58, grain:0.012},
  {selector:'.landing-title-sans', radius:1.7, strength:58, grain:0.012},
];
let liquidStarted = false;
function setupLiquidHover() {
  if (liquidStarted || !copy || reduced || !matchMedia('(hover:hover) and (pointer:fine)').matches) return;
  liquidStarted = true;
  const svg = node('svg', {class:'landing-reveal-filters', 'aria-hidden':'true', focusable:'false'});
  const defs = node('defs', {}, svg);
  const jobs = hoverLines.map((line, index) => {
    const element = copy.querySelector(line.selector);
    if (!element) return null;
    const id = `esmi-liquid-${index}`;
    const filter = node('filter', {id, x:'-0.1', y:'-0.6', width:'1.2', height:'2.2', 'color-interpolation-filters':'sRGB'}, defs);
    node('feTurbulence', {type:'fractalNoise', baseFrequency:line.grain, numOctaves:'2', seed:String(21 + index * 5), result:'noise'}, filter);
    node('feColorMatrix', {in:'noise', type:'matrix', values:'1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0 1', result:'waves'}, filter);
    node('feFlood', {'flood-color':'#000', 'flood-opacity':'1', result:'black'}, filter);
    const image = node('feImage', {href:lens, preserveAspectRatio:'none', x:'0', y:'0', width:'1', height:'1', result:'spot'}, filter);
    image.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', lens);
    const merge = node('feMerge', {result:'mask'}, filter);
    node('feMergeNode', {in:'black'}, merge); node('feMergeNode', {in:'spot'}, merge);
    // displacement = 0.5 + mask * (noise - 0.5): neutral outside the cursor spot
    node('feComposite', {in:'waves', in2:'mask', operator:'arithmetic', k1:'1', k2:'0', k3:'-0.5', k4:'0.5', result:'map'}, filter);
    const displace = node('feDisplacementMap', {in:'SourceGraphic', in2:'map', scale:'0', xChannelSelector:'R', yChannelSelector:'G'}, filter);
    return {...line, element, id, image, displace, x:0, y:0, amount:0, active:false};
  }).filter(Boolean);
  document.body.appendChild(svg);

  let pointerX = -1e4, pointerY = -1e4, lastX = 0, lastY = 0, lastTime = 0, energy = 0, running = false;
  addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse') return;
    const now = performance.now();
    if (lastTime) {
      const speed = Math.hypot(event.clientX - lastX, event.clientY - lastY) / Math.max(8, now - lastTime);
      energy = Math.min(1, Math.max(energy, speed / 1.2));
    }
    pointerX = event.clientX; pointerY = event.clientY; lastX = pointerX; lastY = pointerY; lastTime = now;
    if (!running) { running = true; requestAnimationFrame(tick); }
  }, {passive:true});

  let previous = 0;
  function tick(now) {
    const dt = previous ? Math.min(80, now - previous) / 16.67 : 1; previous = now;
    energy *= Math.pow(0.955, dt); // the wake settles within about a second, at any frame rate
    let busy = energy > 0.008;
    for (const job of jobs) {
      const box = job.element.getBoundingClientRect();
      const size = Math.max(40, box.height * job.radius * 2);
      const localX = pointerX - box.left, localY = pointerY - box.top;
      if (!job.active) { job.x = localX; job.y = localY; }
      const follow = 1 - Math.pow(0.78, dt);
      job.x += (localX - job.x) * follow; job.y += (localY - job.y) * follow; // the spot trails the cursor
      const near = localX > -size && localX < box.width + size && localY > -size && localY < box.height + size;
      job.amount += ((near ? energy : 0) - job.amount) * (1 - Math.pow(0.75, dt));
      if (job.strength * job.amount > 0.4) {
        job.image.setAttribute('x', (job.x - size / 2).toFixed(1));
        job.image.setAttribute('y', (job.y - size / 2).toFixed(1));
        job.image.setAttribute('width', size.toFixed(1));
        job.image.setAttribute('height', size.toFixed(1));
        job.displace.setAttribute('scale', (job.strength * job.amount).toFixed(2));
        if (!job.active) { job.element.style.filter = `url(#${job.id})`; job.active = true; }
        busy = true;
      } else if (job.active) {
        job.element.style.filter = ''; job.active = false;
      }
    }
    if (busy) requestAnimationFrame(tick); else { running = false; previous = 0; }
  }
}

const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise(resolve => setTimeout(resolve, 1200))]).then(reveal, reveal);
