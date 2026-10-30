// WebAudio helper. Context is created lazily from a user gesture (browser autoplay rules).
let ctx: AudioContext | null = null, last = 0;
export const sound = { volume: 0.5, muted: false };
export function unlock() { ctx ??= new AudioContext(); if (ctx.state === 'suspended') void ctx.resume(); }
function beep(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, attack = 0) {
  if (!ctx || sound.muted || sound.volume <= 0) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain(), peak = gain * sound.volume;
  o.type = type; o.frequency.value = freq;
  if (attack) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); } else g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
}
/** One peg passed the flapper. speed in rad/s (~0..35), major = colour-boundary peg, reverse = wheel just changed direction. */
export function tick(speed = 0, major = false, reverse = false) {
  if (!ctx || sound.muted || sound.volume <= 0) return;
  const n = performance.now(); if (n - last < (major ? 10 : 24)) return; last = n;
  const s = Math.min(1, speed / 30), loud = 0.45 + 0.55 * (1 - s), j = 0.92 + Math.random() * 0.16; // slow snaps are clearer and louder
  if (major) { beep(820 * j, 0.05, 'triangle', 0.16 * loud); beep(120 * j, 0.14, 'sine', 0.3 * loud); beep(2400 * j, 0.012, 'square', 0.05 * loud); if (!reverse && speed < 8) navigator.vibrate?.(10); }
  else { beep(2100 * j, 0.016, 'square', 0.05 * loud); beep(190 * j, 0.05, 'sine', 0.1 * loud); }
  if (reverse) { beep(520, 0.04, 'triangle', 0.14); beep(340, 0.07, 'triangle', 0.12, 0.035); } // rock-back clack
}
export function result(win: boolean) { win ? [523, 659, 784].forEach((f, i) => beep(f, 0.35, 'sine', 0.18, i * 0.09)) : [392, 330, 262].forEach((f, i) => beep(f, 0.55, 'triangle', 0.11, i * 0.16, 0.03)); }