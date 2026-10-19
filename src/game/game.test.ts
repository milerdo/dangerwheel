import { describe, expect, it } from 'vitest';
import { CONFIG } from '../config';
import { LADDER as L, cumulativeSurvival, growthRatio, multiplierAt, stageSuccessProbabilities } from './math';
import { acknowledge, cashOut, closePartial, newRun, openPartial, quote, resolve, spin, type Rng, type Run } from './engine';
import { planSpin, pegModel } from './physics';
import { angleAt, makeSpinPlan, outcomeAt, pointerPhi } from './spinPlan';

const WIN: Rng = () => 0, LOSS: Rng = () => 0.999999, P = stageSuccessProbabilities();
const advance = (r: Run, rng: Rng) => acknowledge(resolve(spin(r, rng).run));
const mulberry = (a: number): Rng => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const play = (r: Run, wins: number) => { for (let i = 0; i < wins; i++) r = advance(r, WIN); return r; };

describe('odds and ladder', () => {
  it('derives the ladder from the failure schedule and ends exactly at the cap', () => {
    expect(L[L.length - 1]).toBe(CONFIG.maxMultiplier); expect(L.length).toBe(18);
    L.forEach((m, i) => i && expect(m).toBeGreaterThan(L[i - 1]));
    expect(L[0]).toBeCloseTo(0.96 / 0.9, 12);
  });
  it('probabilities reproduce the schedule: 10% red first, rising to a 50/50 plateau', () => {
    CONFIG.odds.failurePercent.forEach((f, i) => expect(1 - P[i]).toBeCloseTo(f / 100, 9));
    expect(1 - P[0]).toBeCloseTo(0.1, 12);
    for (let i = 14; i < P.length; i++) expect(1 - P[i]).toBeCloseTo(0.5, 3);
    P.forEach((p, i) => { expect(p).toBeGreaterThan(0.49); expect(p).toBeLessThan(1); if (i) expect(1 - p).toBeGreaterThanOrEqual(1 - P[i - 1] - 1e-3); });
  });
  it('every stop-at-round-n strategy has exactly 96% theoretical RTP', () => {
    let cum = 1; P.forEach((p, i) => { cum *= p; expect(cum).toBeCloseTo(cumulativeSurvival()[i], 12); expect(cum * L[i]).toBeCloseTo(0.96, 12); });
  });
  it('growth ratio is the ratio of consecutive multipliers', () => { expect(multiplierAt(0)).toBe(1); expect(growthRatio(3)).toBeCloseTo(L[3] / L[2], 12); });
});

describe('engine', () => {
  const S = 10000;
  it('win advances round and value; loss forfeits only what is in play', () => {
    const r = advance(newRun(S), WIN);
    expect(r).toMatchObject({ phase: 'choosing', cleared: 1, multiplier: L[0], inPlay: Math.round(S * L[0]), secured: 0 });
    expect(resolve(spin(r, LOSS).run)).toMatchObject({ phase: 'failed', inPlay: 0, secured: 0 });
  });
  it('cash out all ends the run and cannot pay twice', () => {
    const r = cashOut(advance(newRun(S), WIN), 1);
    expect(r).toMatchObject({ phase: 'cashedOut', secured: Math.round(S * L[0]), inPlay: 0 }); expect(cashOut(r, 1)).toBe(r);
  });
  it('partial cash-outs across rounds grow the remainder by the ratio of consecutive multipliers', () => {
    let r = advance(newRun(S), WIN); const v1 = r.inPlay;
    r = cashOut(openPartial(r), 0.5); const rem = v1 - Math.round(v1 * 0.5);
    expect(r).toMatchObject({ phase: 'choosing', secured: Math.round(v1 * 0.5), inPlay: rem });
    r = advance(r, WIN); expect(r.inPlay).toBe(Math.round(rem * L[1] / L[0])); expect(r.inPlay).not.toBe(Math.round(rem * L[1]));
    r = advance(r, WIN); expect(r.inPlay).toBeCloseTo(rem * L[2] / L[0], -1);
    const before = r; r = cashOut(r, 0.25); expect(r.secured).toBe(before.secured + Math.round(before.inPlay * 0.25));
    const lost = resolve(spin(r, LOSS).run);
    expect(lost).toMatchObject({ phase: 'failed', secured: r.secured, inPlay: 0 }); // secured money never exposed
  });
  it('guards invalid transitions', () => {
    const r0 = newRun(S); expect(cashOut(r0, 1)).toBe(r0);
    const sp = spin(r0, WIN).run; expect(spin(sp, WIN).run).toBe(sp); expect(cashOut(sp, 1)).toBe(sp); expect(openPartial(sp)).toBe(sp);
    const ok = advance(r0, WIN), part = openPartial(ok);
    expect(spin(part, WIN).run).toBe(part); expect(closePartial(part).phase).toBe('choosing');
    expect(cashOut(ok, 0)).toBe(ok); expect(cashOut(ok, 1.5)).toBe(ok); expect(() => newRun(50)).toThrow();
  });
  it('riding every round pays exactly the 2,500x cap, for any stake', () => {
    for (const stake of [100, 137, 999, 10000]) expect(play(newRun(stake), L.length)).toMatchObject({ phase: 'cashedOut', cleared: 18, secured: 2500 * stake });
  });
  it('secured + in play never exceeds the cap, even with partial cash-outs at awkward stakes', () => {
    const rng = mulberry(5);
    for (let i = 0; i < 300; i++) {
      const stake = 100 + Math.floor(rng() * 9900); let r = newRun(stake);
      while (r.phase !== 'cashedOut') { r = advance(r, WIN); if (r.phase === 'choosing' && rng() < 0.4) r = cashOut(r, 0.1 + rng() * 0.8); expect(r.secured + r.inPlay).toBeLessThanOrEqual(2500 * stake + 1); }
    }
  });
  it('quote exposes secure / remaining / potential', () => {
    const r = advance(newRun(S), WIN), q = quote(r, 0.5);
    expect(q).toMatchObject({ total: r.inPlay, secure: Math.round(r.inPlay * 0.5), nextMultiplier: L[1], nextValue: Math.round(S * L[1]) });
    expect(q.remainingIfSurvive).toBe(Math.round(q.remaining * L[1] / L[0]));
  });
});

describe('simulation (empirical estimate of the theoretical 96%)', () => {
  it('mixed partial strategy returns ~96% over 300k runs and never beats the cap', () => {
    const rng = mulberry(42); let paid = 0, staked = 0; const N = 300_000;
    for (let i = 0; i < N; i++) {
      let r = newRun(10000); staked += 10000;
      while (r.phase !== 'failed' && r.phase !== 'cashedOut') {
        r = advance(r, rng);
        if (r.phase === 'choosing') { if (r.cleared === 2) r = cashOut(r, 0.3); else if (r.cleared === 5) r = cashOut(r, 0.5); else if (r.cleared >= 8) r = cashOut(r, 1); }
      }
      paid += r.secured; expect(r.secured).toBeLessThanOrEqual(2500 * 10000);
    }
    expect(paid / staked).toBeGreaterThan(0.94); expect(paid / staked).toBeLessThan(0.98);
  }, 30000);
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
