// ESMI Inspect: parts inventory. Lists the boat's parts in groups; each can be added to or
// removed from the model (so the boat can be built up part by part) and repainted from a
// marine palette or a custom colour. Choices are kept in localStorage.
//
// Parts are the model's top-level nodes, named "esmi part <id>" in Blender (three.js turns
// the spaces into underscores). Each paint clones its material for that group only, so
// repainting the railings leaves the canopy posts, which share the aluminium, unchanged.

const STORE = 'esmi-inspect-inventory-v1';

const PALETTE = [
  ['White', '#f3f4f5'], ['Silver', '#c3c7cc'], ['Graphite', '#3a3d42'], ['Black', '#1b1d20'],
  ['Navy', '#1d3a5f'], ['ESMI teal', '#31adb5'], ['Ocean blue', '#2f7fb3'], ['Red', '#c43c32'],
  ['Sand', '#d8c7a3'], ['Forest', '#3e6b4f'],
];
// The solar texture is multiplied by its colour, so it gets tints rather than paints.
const SOLAR_TINTS = [['Classic blue', '#ffffff'], ['Deep navy', '#8a93b8'], ['All black', '#3a3a3e']];

const ITEMS = [
  { id: 'hulls', name: 'Twin hulls', parts: /^(port|starboard)-/, paints: [
    { id: 'topsides', name: 'Topsides', materials: ['hull silver'] },
    { id: 'keels', name: 'Keels', materials: ['hull charcoal'] } ] },
  { id: 'crossbeams', name: 'Crossbeams', parts: /^crossbeam/, paints: [{ id: 'beams', name: 'Beams', materials: ['beam'] }] },
  { id: 'deck', name: 'Deck', parts: /^deck-/, paints: [{ id: 'deck', name: 'Deck', materials: ['deck'] }] },
  { id: 'railings', name: 'Railings', parts: /^rail-/, paints: [{ id: 'rails', name: 'Rails', materials: ['brushed aluminium'] }] },
  { id: 'seats', name: 'Seats', parts: /^seat/, paints: [
    { id: 'cushions', name: 'Cushions', materials: ['seat cushion'] },
    { id: 'shells', name: 'Shells', materials: ['seat shell'] } ] },
  { id: 'helm', name: 'Helm console', parts: /^(console|helm-column|steering-wheel|windscreen)$/, paints: [
    { id: 'console', name: 'Console', materials: ['console gelcoat'] },
    { id: 'wheel', name: 'Wheel', materials: ['wheel'] } ] },
  { id: 'canopy', name: 'Canopy frame', parts: /^(upright|roof-|canopy-edge)/, paints: [{ id: 'frame', name: 'Frame', materials: ['brushed aluminium', 'solar frame'] }] },
  { id: 'solar', name: 'Solar panels', parts: /^solar-module/, paints: [{ id: 'cells', name: 'Cells', materials: ['solar cells web'], tints: true }] },
  { id: 'drive', name: 'Electric drive', parts: /^(drive-|propeller)/, paints: [{ id: 'motor', name: 'Motor', materials: ['outboard'] }] },
  { id: 'batteries', name: 'Battery pack', parts: /^(battery-|bms|busbar|distribution-box)/, paints: [{ id: 'cells', name: 'Modules', materials: ['battery'] }] },
  { id: 'wiring', name: 'Wiring & controls', parts: /^(cable|motor-controller|solar-charger)/, paints: [] },
];

const partId = node => node.name.replace(/^esmi[_ ]part[_ ]/, '').replace(/_/g, ' ');
const hex = color => '#' + color.getHexString();

function load() {
  try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; }
}
function save(state) {
  try { localStorage.setItem(STORE, JSON.stringify(state)); } catch {}
}

// Added parts pop in from slightly smaller (the model animates position and rotation only,
// so scale is free to use).
function pop(nodes, reduced) {
  if (reduced) return;
  const start = performance.now(), duration = 420;
  const back = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
  const step = now => {
    const k = Math.min(1, (now - start) / duration), s = .55 + .45 * back(k);
    nodes.forEach(n => n.scale.setScalar(s));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function setupInventory(model, { reduced = false } = {}) {
  const panel = document.querySelector('.ins-inventory');
  if (!panel) return;
  const list = panel.querySelector('.ins-inv-list');
  const count = panel.querySelector('.ins-inv-count');
  const state = load();
  state.hidden ??= {}; state.colors ??= {};

  // Sort the model's parts into the inventory items, cloning each paint's materials.
  const items = ITEMS.map(item => ({ ...item, nodes: [], paints: item.paints.map(p => ({ ...p, clones: [], original: null })) }));
  for (const node of model.children) {
    const id = partId(node);
    const item = items.find(it => it.parts.test(id));
    if (!item) continue;
    item.nodes.push(node);
    node.traverse(mesh => {
      if (!mesh.isMesh) return;
      const swap = m => {
        const name = (m.name || '').replace(/^esmi /, '');
        const paint = item.paints.find(p => p.materials.includes(name));
        if (!paint) return m;
        let clone = paint.clones.find(c => c.userData.source === m);
        if (!clone) { clone = m.clone(); clone.userData.source = m; clone.userData.original = hex(m.color); paint.clones.push(clone); paint.original ??= hex(m.color); }
        return clone;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }
  const live = items.filter(it => it.nodes.length);

  const paintKey = (item, paint) => `${item.id}.${paint.id}`;
  const setColor = (item, paint, value) => {
    const original = value.toLowerCase() === paint.original;
    paint.clones.forEach(m => m.color.set(original ? m.userData.original : value));
    const key = paintKey(item, paint);
    if (value.toLowerCase() === paint.original) delete state.colors[key]; else state.colors[key] = value;
  };
  const updateCount = () => {
    const shown = live.filter(it => !state.hidden[it.id]).length;
    count.textContent = `${shown}/${live.length}`;
  };
  const setShown = (item, shown, animate = true) => {
    const was = item.nodes[0].visible;
    item.nodes.forEach(n => { n.visible = shown; n.scale.setScalar(1); });
    if (shown) delete state.hidden[item.id]; else state.hidden[item.id] = true;
    if (shown && !was && animate) pop(item.nodes, reduced);
    const box = list.querySelector(`[data-item="${item.id}"] input[type="checkbox"]`);
    if (box) box.checked = shown;
    list.querySelector(`[data-item="${item.id}"]`)?.classList.toggle('is-off', !shown);
    updateCount();
  };

  // Build the list.
  list.textContent = '';
  for (const item of live) {
    const li = document.createElement('li');
    li.className = 'ins-inv-item'; li.dataset.item = item.id;
    const row = document.createElement('div'); row.className = 'ins-inv-row';
    const label = document.createElement('label'); label.className = 'ins-inv-name';
    const box = document.createElement('input'); box.type = 'checkbox'; box.checked = true;
    box.setAttribute('aria-label', `Show ${item.name}`);
    const tick = document.createElement('span'); tick.className = 'ins-inv-check'; tick.setAttribute('aria-hidden', 'true');
    label.append(box, tick, document.createTextNode(item.name));
    box.addEventListener('change', () => { setShown(item, box.checked); save(state); });
    const swatches = document.createElement('div'); swatches.className = 'ins-inv-swatches';
    row.append(label, swatches);
    li.append(row);

    for (const paint of item.paints) {
      if (!paint.clones.length) continue;
      const current = state.colors[paintKey(item, paint)] || paint.original;
      const sw = document.createElement('button');
      sw.type = 'button'; sw.className = 'ins-inv-swatch';
      sw.style.setProperty('--c', paint.tints ? (current === '#ffffff' ? '#24356b' : current) : current);
      sw.setAttribute('aria-label', `${item.name}: ${paint.name.toLowerCase()} colour`);
      sw.setAttribute('aria-expanded', 'false');
      sw.title = paint.name;
      swatches.append(sw);

      const palette = document.createElement('div'); palette.className = 'ins-inv-palette'; palette.hidden = true;
      const title = document.createElement('p'); title.className = 'ins-inv-palette-title'; title.textContent = paint.name;
      const grid = document.createElement('div'); grid.className = 'ins-inv-colors';
      const choose = value => {
        setColor(item, paint, value);
        sw.style.setProperty('--c', paint.tints ? (value === '#ffffff' ? '#24356b' : value) : value);
        grid.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === value.toLowerCase())));
        if (picker) picker.value = value;
        save(state);
      };
      const options = paint.tints ? SOLAR_TINTS : [['Original', paint.original], ...PALETTE.filter(([, v]) => v !== paint.original)];
      for (const [name, value] of options) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'ins-inv-color'; b.dataset.color = value.toLowerCase();
        b.style.setProperty('--c', paint.tints && value === '#ffffff' ? '#24356b' : value);
        b.title = name; b.setAttribute('aria-label', name);
        b.setAttribute('aria-pressed', String(value.toLowerCase() === current.toLowerCase()));
        b.addEventListener('click', () => choose(value.toLowerCase()));
        grid.append(b);
      }
      let picker = null;
      if (!paint.tints) {
        const custom = document.createElement('label'); custom.className = 'ins-inv-custom'; custom.title = 'Custom colour';
        picker = document.createElement('input'); picker.type = 'color'; picker.value = current;
        picker.setAttribute('aria-label', `Custom ${paint.name.toLowerCase()} colour`);
        picker.addEventListener('input', () => choose(picker.value.toLowerCase()));
        custom.append(picker);
        grid.append(custom);
      }
      palette.append(title, grid);
      li.append(palette);

      sw.addEventListener('click', () => {
        const opening = palette.hidden;
        list.querySelectorAll('.ins-inv-palette').forEach(p => { p.hidden = true; });
        list.querySelectorAll('.ins-inv-swatch').forEach(s => s.setAttribute('aria-expanded', 'false'));
        palette.hidden = !opening;
        sw.setAttribute('aria-expanded', String(opening));
      });
      if (current !== paint.original) setColor(item, paint, current);
    }
    list.append(li);
    setShown(item, !state.hidden[item.id], false);
  }

  panel.querySelector('[data-inv="all"]').addEventListener('click', () => { live.forEach(it => setShown(it, true)); save(state); });
  panel.querySelector('[data-inv="none"]').addEventListener('click', () => { live.forEach(it => setShown(it, false)); save(state); });
  panel.querySelector('[data-inv="colors"]').addEventListener('click', () => {
    for (const item of live) for (const paint of item.paints) {
      if (!paint.clones.length) continue;
      setColor(item, paint, paint.original);
      const li = list.querySelector(`[data-item="${item.id}"]`);
      const index = item.paints.filter(p => p.clones.length).indexOf(paint);
      li.querySelectorAll('.ins-inv-swatch')[index]?.style.setProperty('--c', paint.tints ? '#24356b' : paint.original);
      li.querySelectorAll('.ins-inv-palette')[index]?.querySelectorAll('[data-color]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.color === paint.original)));
      const picker = li.querySelectorAll('.ins-inv-palette')[index]?.querySelector('input[type="color"]');
      if (picker) picker.value = paint.original;
    }
    save(state);
  });

  // Open by default where there is room beside the boat; a pill on smaller screens.
  const toggle = panel.querySelector('.ins-inv-toggle');
  const setOpen = open => { panel.dataset.open = String(open); toggle.setAttribute('aria-expanded', String(open)); };
  setOpen(innerWidth >= 1100);
  toggle.addEventListener('click', () => setOpen(panel.dataset.open !== 'true'));
  panel.hidden = false;
}
