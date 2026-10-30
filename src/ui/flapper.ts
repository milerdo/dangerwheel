// Spring-loaded flapper arm. A peg shoves the arm aside while it approaches the crest (contact), then the arm is
// released and rings back on a damped spring, so every peg gives a visible knock and snap-back.
export interface Arm { a: number; v: number; u: number } // a: tip sideways angle in rad (+ = right), v: its speed, u: last contact 0..1
const K = 700, C = 18.5; // ~4 Hz spring, underdamped (zeta ~0.35): one clear rebound, settles in ~0.4 s

/** u = peg overlap 0..1 (flapAt), dir = wheel direction (+1 pegs travel right at the pointer, -1 left), dt in seconds. */
export function stepArm(s: Arm, dt: number, u: number, dir: number, max = 0.36) {
  const engaged = u > 0.02 && u >= s.u - 1e-4; // rising or holding on the crest
  s.u = u;
  const lim = dir * u * max, h = Math.min(dt, 0.05) / 4;
  for (let i = 0; i < 4; i++) {
    s.v += (-K * s.a - C * s.v) * h; s.a += s.v * h;
    if (engaged && (dir > 0 ? s.a < lim : s.a > lim)) { s.a = lim; s.v = 0; } // the peg won't let the arm pass
  }
}