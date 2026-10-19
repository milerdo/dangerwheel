import { CONFIG } from '../config';
import { growthRatio, multiplierAt, stageSuccessProbabilities } from './math';

export type Phase = 'ready' | 'spinning' | 'success' | 'choosing' | 'partial' | 'cashedOut' | 'failed';
export type Outcome = 'win' | 'loss';
export type Rng = () => number;
/** All money amounts are integer cents. */
export interface Run {
  phase: Phase; stake: number; cleared: number; multiplier: number;
  inPlay: number; secured: number; pending: Outcome | null;
}
const PROBS = stageSuccessProbabilities();
const LAST = CONFIG.ladder.length;

export const secureRandom: Rng = () => { // demo-grade only; not for real-money use
  const a = new Uint32Array(2); crypto.getRandomValues(a);
  return (a[0] * 2 ** 21 + (a[1] >>> 11)) / 2 ** 53;
};
export const initialRun = (): Run => ({ phase: 'ready', stake: 0, cleared: 0, multiplier: 1, inPlay: 0, secured: 0, pending: null });
export const newRun = (stakeCents: number): Run => {
  const ok = Number.isInteger(stakeCents) && stakeCents >= CONFIG.stake.min * 100 && stakeCents <= CONFIG.stake.max * 100;
  if (!ok) throw new RangeError('Stake out of range');
  return { ...initialRun(), stake: stakeCents, inPlay: stakeCents };
};
export const isFinished = (r: Run) => r.phase === 'cashedOut' || r.phase === 'failed';
export const successChance = (cleared: number) => PROBS[cleared];

/** Decides the outcome BEFORE any animation. Valid from ready (with stake) or choosing. */
export function spin(r: Run, rng: Rng): { run: Run; p: number } {
  if ((r.phase !== 'ready' || r.stake <= 0) && r.phase !== 'choosing') return { run: r, p: PROBS[r.cleared] ?? 0 };
  const p = PROBS[r.cleared];
  return { run: { ...r, phase: 'spinning', pending: rng() < p ? 'win' : 'loss' }, p };
}
/** Applies the predetermined outcome once the wheel has settled. */
export function resolve(r: Run): Run {
  if (r.phase !== 'spinning' || !r.pending) return r;
  if (r.pending === 'loss') return { ...r, phase: 'failed', pending: null, inPlay: 0 };
  const inPlay = Math.round(r.inPlay * growthRatio(r.cleared)); // ratio of consecutive multipliers
  const cleared = r.cleared + 1;
  const base = { ...r, cleared, multiplier: multiplierAt(cleared), pending: null };
  return cleared === LAST
    ? { ...base, phase: 'cashedOut', inPlay: 0, secured: r.secured + inPlay } // top of ladder: auto collect
    : { ...base, phase: 'success', inPlay };
}
export const acknowledge = (r: Run): Run => (r.phase === 'success' ? { ...r, phase: 'choosing' } : r);
export const openPartial = (r: Run): Run => (r.phase === 'choosing' ? { ...r, phase: 'partial' } : r);
export const closePartial = (r: Run): Run => (r.phase === 'partial' ? { ...r, phase: 'choosing' } : r);

/** fraction in (0,1]; 1 ends the run. Only allowed between spins. */
export function cashOut(r: Run, fraction: number): Run {
  if ((r.phase !== 'choosing' && r.phase !== 'partial') || !(fraction > 0) || fraction > 1 || r.inPlay <= 0) return r;
  const take = fraction >= 1 ? r.inPlay : Math.min(r.inPlay, Math.max(1, Math.round(r.inPlay * fraction)));
  const inPlay = r.inPlay - take;
  return { ...r, secured: r.secured + take, inPlay, phase: inPlay === 0 ? 'cashedOut' : 'choosing' };
}
/** Preview numbers for the UI. */
export function quote(r: Run, fraction: number) {
  const ratio = growthRatio(r.cleared);
  const secure = fraction >= 1 ? r.inPlay : Math.round(r.inPlay * fraction);
  const remaining = r.inPlay - secure;
  return { total: r.inPlay, secure, remaining, remainingIfSurvive: Math.round(remaining * ratio),
    nextMultiplier: CONFIG.ladder[r.cleared], nextValue: Math.round(r.inPlay * ratio) };
}
