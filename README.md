## Copyright and Proprietary Rights

Copyright © 2026 Milutin Erdevicki. All rights reserved.

This repository contains proprietary software and original creative materials developed for the Danger Wheel project.

Unless expressly authorized in writing by the copyright holder, no permission is granted to copy, reproduce, redistribute, modify, commercially exploit, or create derivative works from this project's original source code, visual assets, animations, game presentation, or documentation.

No license to use this software or its associated materials is granted by making this repository publicly accessible.

Third-party libraries, assets, and dependencies remain subject to their respective licenses and ownership rights.

For licensing, commercial use, or other permissions, contact the copyright holder.
# Danger Wheel (prototype)

Spin a wheel of green (safe) and red (danger) sectors. Each survived stage raises your multiplier and the red grows.
After a survived stage: **Spin again**, **Cash out** everything, or **Cash out part** and keep the rest at risk.

## Run
```
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests + 300k-run engine simulation
npm run simulate   # 5M-run Monte Carlo of stop-at-stage strategies
npm run build
```
Rename the game in `src/config.ts` (`CONFIG.title`); the same file holds the ladder, RTP, stake limits, spin timing, tease chance and wheel visuals.

## Layout
- `src/game/math.ts` – probabilities from the ladder. `engine.ts` – state machine, accounting (integer cents). `spinPlan.ts` – wheel geometry + animation timeline (presentation only).
- `src/ui/Wheel.tsx` – canvas wheel. `audio.ts` – WebAudio ticks. `src/App.tsx` – interface.

## Math
- Odds source of truth: `CONFIG.odds` (chance of red per round: 10, 13, 16 … 46, 48.325, then 50%). The multiplier ladder is derived: M(n) = 0.96 / P(survive rounds 1..n). The round that reaches 2,500× is clamped to exactly 2,500× and ends the run (18 rounds).
- Round 1 survival = 0.96 / M1; round n = M(n-1) / Mn. Stopping at any round returns Mn × 0.96/Mn = **0.96** exactly, so every strategy (partial cash-outs included) has a 96% theoretical RTP. Simulations only estimate it.
- All the house edge sits in round 1 (it pays 1.067× for a 90% chance); later rounds are fair.
- Money in play = stake × share × multiplier, tracked as an exact share so cent-rounding never compounds. Secured money is separate and never exposed. Secured + in play can never exceed 2,500× the stake.
- Outcome is drawn once before animation; the physics search only finds a spin that ends in that section, using a separate RNG.
- `CONFIG.visual.segments`: 1 = continuous green/red arcs; 2+ repeats the pattern.

## Limitations
Play money only. `crypto.getRandomValues` in the browser is for demos; it is not certified, auditable or suitable for real-money gambling. No server, accounts or payments. Visuals are Canvas 2D, not a real physics engine. Not cross-browser tested beyond modern Chromium-style APIs (uses `createConicGradient`).
