import { CONFIG } from '../config';
import type { Outcome } from './engine';
export type { Outcome };
export const TAU = Math.PI * 2;
export interface Arc { start: number; end: number; safe: boolean }
export interface Seg { dur: number; from: number; to: number; ease: (t: number) => number }
export interface SpinPlan { segments: Seg[]; total: number; finalTheta: number; tease: 'none' | 'creep' | 'rollback'; trace?: { dt: number; th: number[] } }
export type SpinOpts = { [K in keyof typeof CONFIG.spin]: number };

const mod = (a: number, n: number) => ((a % n) + n) % n;
const smooth = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const inOut = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;
// Fast kick, long weighty deceleration; zero velocity at both ends.
const main = (t: number) => (1 - (1 - t) ** 3.6) * smooth(t / 0.06);

/** Wheel layout in wheel-local angles: N repeats of [safe p | danger 1-p]. Safe share == p exactly. */
export function arcs(p: number, n: number = CONFIG.visual.segments): Arc[] {
  const seg = TAU / n, out: Arc[] = [];
  for (let k = 0; k < n; k++) {
    out.push({ start: k * seg, end: k * seg + p * seg, safe: true }, { start: k * seg + p * seg, end: (k + 1) * seg, safe: false });
  }
  return out;
}
/** Local angle under the fixed top pointer when the wheel is rotated clockwise by theta. */
export const pointerPhi = (theta: number) => mod(-Math.PI / 2 - theta, TAU);
export function outcomeAt(theta: number, p: number, n: number = CONFIG.visual.segments): Outcome {
  const seg = TAU / n;
  return mod(pointerPhi(theta), seg) < p * seg ? 'win' : 'loss';
}
const thetaFor = (phi: number, min: number) => { const t = -Math.PI / 2 - phi; return t + TAU * Math.ceil((min - t) / TAU); };

/** Presentation only: `rng` must be separate from the game RNG. The outcome is already decided. */
export function makeSpinPlan(p: number, outcome: Outcome, theta0: number, o: SpinOpts, rng: () => number): SpinPlan {
  const n = CONFIG.visual.segments, seg = TAU / n, win = outcome === 'win';
  const s0 = Math.floor(rng() * n) * seg;
  const arc = win ? { a: s0, b: s0 + p * seg } : { a: s0 + p * seg, b: s0 + seg };
  const w = arc.b - arc.a, other = win ? (1 - p) * seg : p * seg;
  const tease: SpinPlan['tease'] = rng() < o.teaseChance ? (rng() < 0.5 ? 'creep' : 'rollback') : 'none';
  const min = theta0 + (o.minTurns + rng()) * TAU;
  const m = w * 0.18; // landing depth inside the correct arc, even on teases
  let approach: number, final: number, teaseSegs: Seg[] = [], teaseMs = 0;
  if (tease === 'none') {
    approach = final = thetaFor(arc.a + w * (0.2 + 0.6 * rng()), min);
  } else if (tease === 'creep') { // stalls just short of the boundary, then edges across into the target arc
    const c = Math.min(other * 0.12, 0.02);
    approach = thetaFor(arc.b + c, min); final = approach + c + m;
    teaseSegs = [{ dur: o.teaseHoldMs, from: approach, to: approach, ease: inOut }, { dur: o.creepMs, from: approach, to: final, ease: inOut }];
    teaseMs = o.teaseHoldMs + o.creepMs;
  } else { // rolls past the exit boundary, pauses, then rocks back into the target arc
    const over = Math.min(other * 0.4, 0.035);
    approach = thetaFor(arc.a - over, min); final = approach - (over + m);
    teaseSegs = [{ dur: o.teaseHoldMs, from: approach, to: approach, ease: inOut }, { dur: o.rollbackMs, from: approach, to: final, ease: inOut }];
    teaseMs = o.teaseHoldMs + o.rollbackMs;
  }
  const back = theta0 - 0.09;
  const segments: Seg[] = [
    { dur: o.anticipationMs, from: theta0, to: back, ease: inOut },
    { dur: o.durationMs - o.anticipationMs - teaseMs, from: back, to: approach, ease: main },
    ...teaseSegs,
  ];
  if (outcomeAt(final, p) !== outcome) throw new Error('spin plan landed in the wrong section');
  return { segments, total: segments.reduce((s, x) => s + x.dur, 0), finalTheta: final, tease };
}
export function angleAt(plan: SpinPlan, t: number): number {
  if (plan.trace) { const { dt, th } = plan.trace, f = Math.max(0, t) / dt, i = Math.floor(f); return i >= th.length - 1 ? th[th.length - 1] : th[i] + (th[i + 1] - th[i]) * (f - i); }
  for (const s of plan.segments) {
    if (t < s.dur) return s.from + (s.to - s.from) * s.ease(Math.max(0, t / s.dur));
    t -= s.dur;
  }
  return plan.finalTheta;
}
