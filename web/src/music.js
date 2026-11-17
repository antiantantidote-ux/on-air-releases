// Procedural score, no audio files: a 16-step sequencer driving two "bands" that
// cross-fade with alignment — a major-key salsa (clave, tumbao bass, piano montuno)
// when the island is benevolent, a minor-key brass march with snare when it is ruthless.
// Starts on the first button press (browsers require a gesture); silently does nothing
// if Web Audio is unavailable.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
const STEP = 0.14; // seconds per 16th note

const SALSA = {
  clave: [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0],
  bass: [48, 0, 0, 55, 0, 0, 60, 0, 53, 0, 0, 60, 0, 0, 55, 0],
  piano: [[64, 67, 72], 0, [64, 67], 0, [65, 69, 72], 0, 0, [65, 69], [67, 71, 74], 0, [67, 71], 0, [65, 69, 72], 0, [64, 67], 0],
};
const MARCH = {
  snare: [1, 0, 0, 0, 1, 0, 1, 1, 1, 0, 0, 0, 1, 0, 1, 0],
  bass: [38, 0, 0, 0, 45, 0, 0, 0, 38, 0, 0, 0, 41, 0, 43, 0],
  brass: [[50, 53, 57], 0, 0, 0, 0, 0, [50, 53, 57], 0, [48, 52, 55], 0, 0, 0, [46, 50, 53], 0, [45, 49, 52], 0],
};

export function createMusic() {
  let ctx = null, master = null, salsa = null, march = null, noise = null;
  let step = 0, nextTime = 0, mood = 0, muted = false;

  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0.16; master.connect(ctx.destination);
      salsa = ctx.createGain(); march = ctx.createGain();
      salsa.connect(master); march.connect(master);
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.25, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      noise = buf;
      nextTime = ctx.currentTime + 0.1;
    } catch { ctx = null; }
  }

  function tone(bus, freq, when, dur, type, gain) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(bus);
    o.start(when); o.stop(when + dur + 0.02);
  }
  function hit(bus, when, dur, gain, highpass) {
    const s = ctx.createBufferSource(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    s.buffer = noise; f.type = 'highpass'; f.frequency.value = highpass;
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(when); s.stop(when + dur);
  }

  function schedule(i, when) {
    if (SALSA.clave[i]) tone(salsa, 2100, when, 0.05, 'square', 0.12);
    if (SALSA.bass[i]) tone(salsa, midi(SALSA.bass[i] - 12), when, 0.26, 'triangle', 0.5);
    if (SALSA.piano[i]) for (const n of SALSA.piano[i]) tone(salsa, midi(n), when, 0.16, 'triangle', 0.16);
    if (MARCH.snare[i]) hit(march, when, 0.09, 0.35, 1800);
    if (MARCH.bass[i]) tone(march, midi(MARCH.bass[i] - 12), when, 0.3, 'sawtooth', 0.32);
    if (MARCH.brass[i]) for (const n of MARCH.brass[i]) tone(march, midi(n), when, 0.42, 'sawtooth', 0.11);
  }

  return {
    start,
    /** mood: -1 ruthless .. +1 benevolent. Call every frame. */
    update(value, paused) {
      if (!ctx || ctx.state !== 'running') return;
      mood += (value - mood) * 0.02;
      const t = ctx.currentTime, k = (mood + 1) / 2, quiet = paused || muted ? 0 : 1;
      salsa.gain.setTargetAtTime(quiet * Math.min(1, k * 1.6), t, 0.3);
      march.gain.setTargetAtTime(quiet * Math.min(1, (1 - k) * 1.6), t, 0.3);
      if (nextTime < t) nextTime = t + 0.05; // tab was asleep: don't burst-schedule the backlog
      while (nextTime < t + 0.25) { schedule(step, nextTime); step = (step + 1) % 16; nextTime += STEP; }
    },
    toggleMute() { muted = !muted; return muted; },
    get running() { return !!ctx && ctx.state === 'running'; },
  };
}
