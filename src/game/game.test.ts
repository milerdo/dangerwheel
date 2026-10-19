import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { cumulativeSurvival, growthRatio, multiplierAt, stageSuccessProbabilities } from './math';
import { acknowledge, cashOut, closePartial, newRun, openPartial, quote, resolve, spin, type Rng, type Run } from './engine';
import { planSpin, pegModel } from './physics';
import { angleAt, makeSpinPlan, outcomeAt, pointerPhi } from './spinPlan';

const WIN: Rng = () => 0, LOSS: Rng = () => 0.999999;
const L = CONFIG.ladder, P = stageSuccessProbabilities();
const advance = (r: Run, rng: Rng) => acknowledge(resolve(spin(r, rng).run));
const mulberry = (a: number): Rng => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

describe('math', () => {
  it('ladder reaches max and is increasing', () => {
    expect(L[L.length - 1]).toBe(CONFIG.maxMultiplier);
    L.forEach((m, i) => i && expect(m).toBeGreaterThan(L[i - 1]));
  });
  it('conditional probabilities follow spec', () => {
    expect(P[0]).toBeCloseTo(0.96 / 1.1, 12);
    for (let i = 1; i < L.length; i++) expect(P[i]).toBeCloseTo(L[i - 1] / L[i], 12);
    P.forEach((p) => { expect(p).toBeGreaterThan(0); expect(p).toBeLessThan(1); });
    expect(1 - P[11]).toBeCloseTo(0.74, 12);
  });
  it('products of conditionals equal rtp/M and every stop-at-n strategy returns 96%', () => {
    let cum = 1;
    P.forEach((p, i) => { cum *= p; expect(cum).toBeCloseTo(cumulativeSurvival()[i], 12); expect(cum * L[i]).toBeCloseTo(0.96, 12); });
  });
  it('danger grows after stage 1 (safe share shrinks)', () => { for (let i = 2; i < P.length; i++) expect(P[i]).toBeLessThan(P[i - 1] + 1e-9); });
  it('growth ratio is consecutive multipliers', () => {
    expect(multiplierAt(0)).toBe(1); expect(growthRatio(0)).toBeCloseTo(1.1); expect(growthRatio(3)).toBeCloseTo(2.7 / 1.9);
  });
});

describe('engine', () => {
  const $100 = 10000;
  it('win advances stage and value; loss forfeits only in-play', () => {
    const r = advance(newRun($100), WIN);
    expect(r).toMatchObject({ phase: 'choosing', cleared: 1, multiplier: 1.1, inPlay: 11000, secured: 0 });
    expect(resolve(spin(r, LOSS).run)).toMatchObject({ phase: 'failed', inPlay: 0, secured: 0 });
  });
  it('cash out all ends the run', () => {
    const r = cashOut(advance(newRun($100), WIN), 1);
    expect(r).toMatchObject({ phase: 'cashedOut', secured: 11000, inPlay: 0 });
    expect(cashOut(r, 1)).toBe(r); // no duplicate payout
  });
  it('partial cash-outs across stages use ratio of consecutive multipliers', () => {
    let r = advance(newRun($100), WIN);               // 110
    r = cashOut(openPartial(r), 0.5);                  // secure 55, 55 at risk
    expect(r).toMatchObject({ phase: 'choosing', secured: 5500, inPlay: 5500 });
    r = advance(r, WIN);                               // 55 * 1.4/1.1 = 70 (not 55*1.4)
    expect(r.inPlay).toBe(7000);
    r = advance(r, WIN);                               // 70 * 1.9/1.4 = 95
    expect(r.inPlay).toBe(9500);
    r = cashOut(r, 0.25);                              // secure 23.75
    expect(r).toMatchObject({ secured: 5500 + 2375, inPlay: 7125 });
    const lost = resolve(spin(r, LOSS).run);
    expect(lost).toMatchObject({ phase: 'failed', secured: 7875, inPlay: 0 }); // secured never exposed
  });
  it('guards invalid transitions', () => {
    const r0 = newRun($100);
    expect(cashOut(r0, 1)).toBe(r0);                   // no cash-out before a stage is cleared
    const sp = spin(r0, WIN).run;
    expect(spin(sp, WIN).run).toBe(sp);                // no duplicate spin
    expect(cashOut(sp, 1)).toBe(sp);                   // no cash-out mid-spin
    expect(openPartial(sp)).toBe(sp);
    const ok = advance(r0, WIN), part = openPartial(ok);
    expect(spin(part, WIN).run).toBe(part);
    expect(closePartial(part).phase).toBe('choosing');
    expect(cashOut(ok, 0)).toBe(ok); expect(cashOut(ok, 1.5)).toBe(ok);
    expect(() => newRun(50)).toThrow();
  });
  it('clearing stage 12 pays 2500x automatically', () => {
    let r = newRun($100); for (let i = 0; i < 12; i++) r = advance(r, WIN);
    expect(r).toMatchObject({ phase: 'cashedOut', secured: 2500 * $100, cleared: 12 });
  });
  it('quote exposes secure/remaining/potential', () => {
    const q = quote(advance(newRun($100), WIN), 0.5);
    expect(q).toMatchObject({ total: 11000, secure: 5500, remaining: 5500, remainingIfSurvive: 7000, nextValue: 14000 });
  });
});

describe('simulation (empirical, not the theoretical RTP)', () => {
  it('mixed partial strategy returns ~96% over 300k runs', () => {
    const rng = mulberry(42); let paid = 0, staked = 0; const N = 300_000;
    for (let i = 0; i < N; i++) {
      let r = newRun(10000); staked += 10000;
      while (r.phase !== 'failed' && r.phase !== 'cashedOut') {
        r = advance(r, rng);
        if (r.phase === 'choosing') { if (r.cleared === 1) r = cashOut(r, 0.3); else if (r.cleared === 3) r = cashOut(r, 0.5); else if (r.cleared >= 5) r = cashOut(r, 1); }
      }
      paid += r.secured;
    }
    expect(paid / staked).toBeGreaterThan(0.94); expect(paid / staked).toBeLessThan(0.98);
  });
});

describe('spin plan', () => {
  it('always ends unambiguously in the predetermined section, with varied teases', () => {
    const rng = mulberry(7); const kinds = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const stage = i % 12, p = P[stage], outcome = rng() < p ? 'win' : 'loss';
      const plan = makeSpinPlan(p, outcome, (rng() - 0.5) * 50, CONFIG.spin, rng); kinds.add(plan.tease);
      expect(outcomeAt(plan.finalTheta, p)).toBe(outcome);
      expect(outcomeAt(angleAt(plan, plan.total + 1000), p)).toBe(outcome);
      expect(plan.total).toBeCloseTo(CONFIG.spin.durationMs, 6);
      const seg = (Math.PI * 2) / CONFIG.visual.segments, phi = pointerPhi(plan.finalTheta) % seg;
      const edge = Math.min(Math.abs(phi - p * seg), phi, seg - phi);
      expect(edge).toBeGreaterThan(0.002); // clear of any boundary
    }
    expect(kinds).toEqual(new Set(['none', 'creep', 'rollback']));
  });
});

describe('physics spin', () => {
  it('lands in the predetermined section in ~4s, clear of boundary pegs, with a minority of dramatic finishes', () => {
    const rng = mulberry(11); let teased = 0; const N = 120;
    for (let i = 0; i < N; i++) {
      const p = P[i % 12], outcome = rng() < p ? 'win' : 'loss', plan = planSpin(p, outcome, rng() * 40, rng);
      expect(plan.trace).toBeDefined();
      expect(outcomeAt(plan.finalTheta, p)).toBe(outcome);
      expect(outcomeAt(angleAt(plan, plan.total + 500), p)).toBe(outcome);
      expect(plan.total).toBeGreaterThan(3300); expect(plan.total).toBeLessThan(5000);
      const m = pegModel(p), phi = pointerPhi(plan.finalTheta);
      const edge = Math.min(...m.pegs.filter((g) => g.major).map((g) => { const d = Math.abs(phi - g.phi) % (Math.PI * 2); return Math.min(d, Math.PI * 2 - d); }));
      expect(edge).toBeGreaterThan(m.h * 0.5);
      if (plan.tease !== 'none') teased++;
    }
    expect(teased / N).toBeGreaterThan(0.1); expect(teased / N).toBeLessThan(0.65);
  }, 30000);
});
