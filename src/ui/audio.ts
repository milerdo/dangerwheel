// Tiny WebAudio helper. Context is created lazily from a user gesture (browser autoplay rules).
let ctx: AudioContext | null = null, last = 0;
export const sound = { volume: 0.5, muted: false };
export function unlock() { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); }
function beep(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) {
  if (!ctx || sound.muted || sound.volume <= 0) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(gain * sound.volume, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
export function tick() { const n = performance.now(); if (n - last < 28) return; last = n; beep(1500 + Math.random() * 200, 0.025, 'square', 0.05); }
export function result(win: boolean) { win ? [523, 659, 784].forEach((f, i) => beep(f, 0.35, 'sine', 0.18, i * 0.09)) : beep(90, 0.7, 'sawtooth', 0.22); }
