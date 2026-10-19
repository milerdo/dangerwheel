// Single place for title, math, stakes, animation and visual tuning.
export const CONFIG = {
  title: 'Danger Wheel', // may become "Murphy's Law" / "Murphy's Wheel"
  tagline: 'Spin. Survive. Cash out — or push your luck.',
  rtp: 0.96,
  maxMultiplier: 2500,
  /** Chance of RED per round (%), then the plateau. The multiplier ladder is DERIVED from this (see math.ts).
   *  Round 14 is 48.325 so the ladder lands on exactly maxMultiplier at round 18. */
  odds: { failurePercent: [10, 13, 16, 19, 22, 25, 28, 31, 34, 37, 40, 43, 46, 48.325], plateauFailurePercent: 50 },
  stake: { min: 1, max: 100, presets: [1, 5, 10, 25, 50, 100] },
  startingBalance: 1000, // play money, dollars
  spin: {
    durationMs: 4000, anticipationMs: 300, minTurns: 4,
    teaseChance: 0.35, teaseHoldMs: 240, creepMs: 380, rollbackMs: 460,
  },
  // Wheel physics: bump = peg/flapper barrier energy, k = viscous drag, c = dry friction, launch = flick torque range
  physics: { bump: 0.72, k: 1.6, c: 0.4, windup: 6, launchMin: 110, launchMax: 150 },
  visual: { segments: 1, pegs: 24 } // segments: 1 = one continuous green arc + one red arc; 2+ repeats the pattern,
} as const;
