import { CONFIG } from '../src/config';
import { stageSuccessProbabilities } from '../src/game/math';
import { planSpin } from '../src/game/physics';
const P = stageSuccessProbabilities(); const d: number[] = [], kinds: Record<string, number> = {}; let fb = 0, ms = 0; const t0 = Date.now();
for (let i = 0; i < 200; i++) { const p = P[i % 12], o = Math.random() < p ? 'win' : 'loss'; const pl = planSpin(p, o, Math.random() * 6, Math.random); if (!pl.trace) fb++; d.push(pl.total); kinds[pl.tease] = (kinds[pl.tease] || 0) + 1; }
ms = (Date.now() - t0) / 200; d.sort((a, b) => a - b);
console.log({ min: d[0], med: d[100], max: d[199], kinds, fallback: fb, msPerPlan: ms.toFixed(1), cfg: CONFIG.physics });
