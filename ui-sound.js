// ESMI interface sounds, synthesised with Web Audio (no audio files).
// Browsers only allow audio after the visitor's first click, tap or key press on the page,
// so the first such interaction starts the shared AudioContext. Sounds play whether or not
// the landing's background sound is on.

let audio = null;
let noise = null;

function startAudio() {
  const Context = window.AudioContext || window.webkitAudioContext;
  if (!Context) return null;
  audio ??= new Context();
  if (audio.state === 'suspended') audio.resume();
  return audio;
}
for (const type of ['pointerdown','keydown']) addEventListener(type,startAudio,{capture:true,passive:true});

// Run `play` once the context is running (the click that triggers a sound may still be
// resuming it).
function whenRunning(play) {
  const ctx = startAudio();
  if (!ctx) return;
  if (ctx.state === 'running') play(ctx);
  else ctx.resume().then(() => { if (ctx.state === 'running') play(ctx); }).catch(() => {});
}

function noiseBuffer(ctx) {
  if (noise) return noise;
  const length = ctx.sampleRate * 3;
  noise = { white: ctx.createBuffer(1, length, ctx.sampleRate), brown: ctx.createBuffer(1, length, ctx.sampleRate) };
  const white = noise.white.getChannelData(0), brown = noise.brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    white[i] = Math.random() * 2 - 1;
    last = (last + .02 * white[i]) / 1.02;
    brown[i] = last * 3.5;
  }
  return noise;
}

// Hover tick on "Explore the E-Boat", modelled on unseen.co's button hover sound: a soft
// ~1.4 kHz tone with a quick pitch dip, held for ~4 ms, mostly gone by 9 ms, with a faint
// tail to ~35 ms. Only plays once audio has started (no hover on touch screens).
export function hoverTick() {
  if (!audio || audio.state !== 'running') return;
  const t = audio.currentTime + .005;
  const tone = audio.createOscillator();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(1340,t);
  tone.frequency.linearRampToValueAtTime(1470,t + .002);
  tone.frequency.exponentialRampToValueAtTime(1130,t + .007);
  tone.frequency.exponentialRampToValueAtTime(1460,t + .010);
  tone.frequency.exponentialRampToValueAtTime(1340,t + .016);
  const level = audio.createGain();
  level.gain.setValueAtTime(.0001,t);
  level.gain.exponentialRampToValueAtTime(.16,t + .0015);
  level.gain.linearRampToValueAtTime(.14,t + .004);
  level.gain.exponentialRampToValueAtTime(.008,t + .0085);
  level.gain.exponentialRampToValueAtTime(.005,t + .026);
  level.gain.exponentialRampToValueAtTime(.0001,t + .034);
  tone.connect(level).connect(audio.destination);
  tone.start(t);
  tone.stop(t + .04);
}

// Going under the water, timed to the "Explore the E-Boat" dive (camera drops through the
// surface, then ~2.6 s of rising bubbles): a splash and low thump at the surface, the sound
// turning muffled as a low underwater rumble swells and fades, and a stream of bubble
// "bloops" (short sine chirps rising in pitch) that thins out as the bubbles clear.
export function underwaterPlunge() {
  whenRunning(ctx => {
    const { white, brown } = noiseBuffer(ctx);
    const t0 = ctx.currentTime + .02, hit = t0 + .12;
    const out = ctx.createGain();
    out.gain.value = .9;
    out.connect(ctx.destination);

    // Splash: a bright burst of spray at the surface.
    const spray = ctx.createBufferSource(); spray.buffer = white;
    const sprayBand = ctx.createBiquadFilter(); sprayBand.type = 'bandpass'; sprayBand.Q.value = .7;
    sprayBand.frequency.setValueAtTime(3200,hit);
    sprayBand.frequency.exponentialRampToValueAtTime(900,hit + .45);
    const sprayLevel = ctx.createGain();
    sprayLevel.gain.setValueAtTime(.0001,hit);
    sprayLevel.gain.exponentialRampToValueAtTime(.32,hit + .015);
    sprayLevel.gain.exponentialRampToValueAtTime(.0001,hit + .5);
    spray.connect(sprayBand).connect(sprayLevel).connect(out);
    spray.start(hit, Math.random() * 2); spray.stop(hit + .55);

    // Thump: the body of the plunge.
    const thump = ctx.createOscillator(); thump.type = 'sine';
    thump.frequency.setValueAtTime(110,hit);
    thump.frequency.exponentialRampToValueAtTime(42,hit + .3);
    const thumpLevel = ctx.createGain();
    thumpLevel.gain.setValueAtTime(.0001,hit);
    thumpLevel.gain.exponentialRampToValueAtTime(.42,hit + .012);
    thumpLevel.gain.exponentialRampToValueAtTime(.0001,hit + .4);
    thump.connect(thumpLevel).connect(out);
    thump.start(hit); thump.stop(hit + .45);

    // Underwater: a low rumble whose high end closes down as the camera sinks.
    const deep = ctx.createBufferSource(); deep.buffer = brown;
    const muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.Q.value = .5;
    muffle.frequency.setValueAtTime(2200,hit);
    muffle.frequency.exponentialRampToValueAtTime(320,hit + .8);
    const deepLevel = ctx.createGain();
    deepLevel.gain.setValueAtTime(.0001,hit);
    deepLevel.gain.exponentialRampToValueAtTime(.5,hit + .25);
    deepLevel.gain.setValueAtTime(.5,hit + .9);
    deepLevel.gain.exponentialRampToValueAtTime(.06,t0 + 2.2);
    deepLevel.gain.exponentialRampToValueAtTime(.0001,t0 + 2.9);
    deep.connect(muffle).connect(deepLevel).connect(out);
    deep.start(hit, Math.random()); deep.stop(t0 + 3);

    // Bubbles: each one a short sine chirp whose pitch rises as it shrinks and climbs.
    const bubbleTone = ctx.createBiquadFilter(); bubbleTone.type = 'lowpass'; bubbleTone.frequency.value = 2600;
    bubbleTone.connect(out);
    for (let i = 0; i < 48; i++) {
      const at = hit + .06 + Math.pow(Math.random(), 1.5) * 2.2;
      const size = Math.random();                                   // 0 small, 1 large
      const f0 = 1250 - size * 900 + Math.random() * 120;
      const dur = .025 + size * .07 + Math.random() * .02;
      const level = (.05 + size * .09) * Math.max(.2, 1 - (at - hit) / 2.6);
      const bloop = ctx.createOscillator(); bloop.type = 'sine';
      bloop.frequency.setValueAtTime(f0,at);
      bloop.frequency.exponentialRampToValueAtTime(f0 * (1.6 + Math.random() * .8),at + dur);
      const env = ctx.createGain();
      env.gain.setValueAtTime(.0001,at);
      env.gain.exponentialRampToValueAtTime(level,at + .004);
      env.gain.exponentialRampToValueAtTime(.0001,at + dur);
      bloop.connect(env).connect(bubbleTone);
      bloop.start(at); bloop.stop(at + dur + .01);
    }
  });
}
