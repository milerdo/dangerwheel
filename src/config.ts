// Single place for title, math, stakes, animation and visual tuning.
export const CONFIG = {
  title: 'Danger Wheel', // may become "Murphy's Law" / "Murphy's Wheel"
  tagline: 'Spin. Survive. Cash out — or push your luck.',
  rtp: 0.96,
  maxMultiplier: 2500,
  /** Total-return multipliers (including stake) after surviving stage 1..12. */
  ladder: [1.1, 1.4, 1.9, 2.7, 4.2, 7, 13, 26, 65, 200, 650, 2500],
  stake: { min: 1, max: 100, presets: [1, 5, 10, 25, 50, 100] },
  startingBalance: 1000, // play money, dollars
  spin: {
    durationMs: 4000, anticipationMs: 300, minTurns: 4,
    teaseChance: 0.35, teaseHoldMs: 240, creepMs: 380, rollbackMs: 460,
  },
  // Wheel physics: bump = peg/flapper barrier energy, k = viscous drag, c = dry friction, launch = flick torque range
  physics: { bump: 0.72, k: 1.6, c: 0.4, windup: 6, launchMin: 110, launchMax: 150 },
  visual: { segments: 6, pegs: 24 },
} as const;
