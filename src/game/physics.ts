// Physical wheel: inertia + drag + dry friction, with brass pegs at every sector boundary (and between) acting on a
// spring flapper. Pegs form a periodic energy barrier, so a slow wheel can crest a peg and tip over, or roll back.
// The OUTCOME is fixed first; we only search (with a presentation RNG) for a simulated spin that ends in it.
import { CONFIG } from '../config';
import { TAU, arcs, makeSpinPlan, outcomeAt, type Outcome, type SpinPlan } from './spinPlan';
const PH = CONFIG.physics, DT = 0.001, MAXN = 7000;
export interface Peg { phi: number; major: boolean }
export interface PegModel { pegs: Peg[]; h: number; bins: Peg[][] }
const NB = 72;
const wrap = (x: number) => ((((x + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

export function pegModel(p: number): PegModel {
  const pegs: Peg[] = [];
  for (const a of arcs(p)) {
    pegs.push({ phi: a.start, major: true });
    const n = Math.round((a.end - a.start) / 0.19);
    for (let i = 1; i < n; i++) pegs.push({ phi: a.start + ((a.end - a.start) * i) / n, major: false });
  }
  const s = pegs.map((g) => g.phi).sort((x, y) => x - y); let gap = 1;
  s.forEach((v, i) => { gap = Math.min(gap, (s[(i + 1) % s.length] - v + TAU) % TAU || TAU); });
  const h = Math.min(0.06, gap * 0.4), bins: Peg[][] = Array.from({ length: NB }, () => []);
  for (const g of pegs) { const lo = Math.floor(((g.phi - h) / TAU) * NB), hi = Math.floor(((g.phi + h) / TAU) * NB); for (let b = lo; b <= hi; b++) bins[((b % NB) + NB) % NB].push(g); }
  return { pegs, h, bins };
}
const phiAt = (th: number) => -Math.PI / 2 - th;
/** 0..1 flapper deflection for the nearest peg (visual only). */
export function flapAt(m: PegModel, th: number): number {
  let v = 0; for (const g of m.pegs) { const d = Math.abs(wrap(g.phi - phiAt(th))); if (d < m.h) v = Math.max(v, (1 + Math.cos((Math.PI * d) / m.h)) / 2); } return v;
}
/** Number of pegs the pointer passed between two wheel angles (for tick sounds). */
export function pegsCrossed(m: PegModel, a: number, b: number): number {
  let n = 0; for (const g of m.pegs) { const d0 = wrap(g.phi - phiAt(a)), d1 = wrap(g.phi - phiAt(b)); if (d0 * d1 < 0 && Math.abs(d0 - d1) < 1) n++; } return n;
}
/** Pegs the pointer passed between two wheel angles, in no particular order (for tick sounds and the arm). */
export function pegHits(m: PegModel, a: number, b: number): Peg[] {
  const out: Peg[] = []; for (const g of m.pegs) { const d0 = wrap(g.phi - phiAt(a)), d1 = wrap(g.phi - phiAt(b)); if (d0 * d1 < 0 && Math.abs(d0 - d1) < 1) out.push(g); } return out;
}
const nearMajor = (m: PegModel, th: number) => Math.min(...m.pegs.filter((g) => g.major).map((g) => Math.abs(wrap(g.phi - phiAt(th)))));
const BUF = new Float64Array(MAXN);

export function sim(m: PegModel, th0: number, A: number, off = 0, dir = 1, w0 = 0) {
  let th = th0, w = w0, rest = 0, rev = 0, last = 0;
  const K = (PH.bump * Math.PI) / (2 * m.h);
  for (let i = 0; i < 5100; i++) {
    const t = i * DT + off; BUF[i] = th;
    let F = -PH.k * w + dir * (t < 0.26 ? -PH.windup * Math.sin((Math.PI * t) / 0.26) : t < 0.68 ? A * Math.sin((Math.PI * (t - 0.26)) / 0.42) : 0);
    const fp = phiAt(th);
    for (const g of m.bins[Math.floor((((fp % TAU) + TAU) % TAU) / TAU * NB) % NB]) { const d = wrap(g.phi - fp); if (d > -m.h && d < m.h) F += K * Math.sin((Math.PI * d) / m.h); }
    if (w === 0) {
      if (Math.abs(F) <= PH.c) { if (++rest > 40 && t > 0.7) return { n: i + 1, rev }; continue; }
      rest = 0; w = (F - Math.sign(F) * PH.c) * DT;
    } else { let nw = w + (F - Math.sign(w) * PH.c) * DT; if (nw * w < 0) nw = 0; w = nw; }
    th += w * DT;
    const sg = Math.sign(w); if (sg) { if (last && sg !== last && t > 1 && nearMajor(m, th) < m.h * 1.05) rev++; last = sg; }
  }
  return null;
}

export function planSpin(p: number, outcome: Outcome, th0: number, rng: () => number = Math.random, o?: { strength: number; skip: boolean; dir?: 1 | -1; speed?: number }): SpinPlan {
  const m = pegModel(p), want = rng() < CONFIG.spin.teaseChance;
  for (let tries = 0; tries < 400; tries++) {
    const off = o?.skip ? 0.26 : 0, frac = o && tries < 200 ? Math.min(1, Math.max(0, 0.15 + 0.7 * o.strength + (rng() - 0.5) * 0.3)) : rng();
    const dir = o?.dir ?? 1, w0 = o?.skip ? dir * Math.min(o.speed ?? 0, 30) : 0, A0 = PH.launchMin + (PH.launchMax - PH.launchMin) * frac;
    const r = sim(m, th0, o?.skip ? Math.max(0, A0 - Math.abs(w0) / 0.267) : A0, off, dir, w0); // the finger's speed carries on; the launch only adds what is missing
    if (!r || r.n < 3300 - off * 1000 || r.n > 5000 - off * 1000) continue;
    const th = BUF[r.n - 1]; if (outcomeAt(th, p) !== outcome) continue;
    const drama = r.rev > 0 || nearMajor(m, th) < 1.25 * m.h;
    if ((want ? tries < 300 : tries < 350) && drama !== want) continue;
    return { segments: [], total: r.n, finalTheta: th, tease: r.rev > 0 ? 'rollback' : drama ? 'creep' : 'none', trace: { dt: DT * 1000, th: Array.from(BUF.subarray(0, r.n)) } };
  }
  return makeSpinPlan(p, outcome, th0, CONFIG.spin, rng); // keyframed fallback; never hit in practice
}