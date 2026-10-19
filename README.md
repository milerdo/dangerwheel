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
- Stage 1 survival = 0.96 / M1; stage n survival = M(n-1) / Mn. Cumulative survival to stage n = 0.96 / Mn.
- Stopping at any stage n returns Mn × 0.96/Mn = **0.96** exactly, so every cash-out strategy (including partial cash-outs) has a 96% theoretical RTP. This is an exact result; simulations only estimate it with sampling noise.
- Stage 12 failure probability = 1 − 650/2500 = 74%.
- Money in play grows by M(next)/M(current), never by the cumulative multiplier. Secured money is stored separately and is never exposed.
- The outcome is drawn once (`spin`) before animation; `makeSpinPlan` only builds a path to a landing spot inside the matching section (asserted) and uses a separate RNG.
- Wheel: 6 repeats of [safe p | danger 1−p], so total safe share equals the unrounded probability.

## Limitations
Play money only. `crypto.getRandomValues` in the browser is for demos; it is not certified, auditable or suitable for real-money gambling. No server, accounts or payments. Visuals are Canvas 2D, not a real physics engine. Not cross-browser tested beyond modern Chromium-style APIs (uses `createConicGradient`).
