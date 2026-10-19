import { CONFIG } from '../config';
type Ladder = readonly number[];

/** P(survive stage n | reached it). Stage 1 = rtp/M1; stage n = M(n-1)/Mn. */
export function stageSuccessProbabilities(ladder: Ladder = CONFIG.ladder, rtp: number = CONFIG.rtp): number[] {
  return ladder.map((m, i) => (i === 0 ? rtp / m : ladder[i - 1] / m));
}
/** P(survive stages 1..n) = rtp / Mn. */
export const cumulativeSurvival = (ladder: Ladder = CONFIG.ladder, rtp: number = CONFIG.rtp) => ladder.map((m) => rtp / m);
/** Multiplier after `cleared` stages (1 = just the stake). */
export const multiplierAt = (cleared: number, ladder: Ladder = CONFIG.ladder) => (cleared === 0 ? 1 : ladder[cleared - 1]);
/** Ratio applied to money still in play when advancing from `cleared` to `cleared+1`. */
export const growthRatio = (cleared: number, ladder: Ladder = CONFIG.ladder) => ladder[cleared] / multiplierAt(cleared, ladder);
