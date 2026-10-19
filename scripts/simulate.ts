import { CONFIG } from '../src/config';
import { LADDER, stageSuccessProbabilities } from '../src/game/math';
const P = stageSuccessProbabilities(), L = LADDER, N = 5_000_000;
console.log(`Theoretical RTP (exact, any stop-at-stage strategy): ${CONFIG.rtp * 100}%`);
for (const stop of [1, 3, 6, 10, 14, 18]) {
  let paid = 0;
  for (let i = 0; i < N; i++) { let s = 0; while (s < stop && Math.random() < P[s]) s++; if (s === stop) paid += L[stop - 1]; }
  console.log(`stop at stage ${String(stop).padStart(2)} (${L[stop - 1]}x): simulated RTP ${(paid / N * 100).toFixed(2)}% over ${N.toLocaleString()} runs`);
}
