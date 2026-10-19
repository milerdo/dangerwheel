import { CONFIG } from '../config';
type Ladder = readonly number[];

/** Total-return multipliers from a failure schedule: M(n) = rtp / P(survive rounds 1..n). The round that reaches
 *  `max` is clamped to exactly `max` and ends the run, so cashed-out + in-play money can never exceed max x stake. */
export function buildLadder(failurePercent: readonly number[], plateau: number, rtp: number, max: number): number[] {
  const out: number[] = []; let surv = 1;
  for (let n = 0; n < 500; n++) {
    surv *= 1 - (n < failurePercent.length ? failurePercent[n] : plateau) / 100;
    const m = rtp / surv;
    if (m >= max * 0.999) return [...out, max];
    out.push(m);
  }
  throw new Error('Odds schedule never reaches the max multiplier');
}
export const LADDER: readonly number[] = buildLadder(CONFIG.odds.failurePercent, CONFIG.odds.plateauFailurePercent, CONFIG.rtp, CONFIG.maxMultiplier);

/** P(survive round n | reached it). Round 1 = rtp/M1; round n = M(n-1)/Mn (so the schedule's odds come back out). */
export function stageSuccessProbabilities(ladder: Ladder = LADDER, rtp: number = CONFIG.rtp): number[] {
  return ladder.map((m, i) => (i === 0 ? rtp / m : ladder[i - 1] / m));
}
/** P(survive rounds 1..n) = rtp / Mn. */
export const cumulativeSurvival = (ladder: Ladder = LADDER, rtp: number = CONFIG.rtp) => ladder.map((m) => rtp / m);
/** Multiplier after `cleared` rounds (1 = just the stake). */
export const multiplierAt = (cleared: number, ladder: Ladder = LADDER) => (cleared === 0 ? 1 : ladder[cleared - 1]);
/** Ratio applied to money in play when advancing from `cleared` to `cleared+1`. */
export const growthRatio = (cleared: number, ladder: Ladder = LADDER) => ladder[cleared] / multiplierAt(cleared, ladder);
