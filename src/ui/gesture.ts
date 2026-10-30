import { CONFIG } from '../config';
export interface Sample { t: number; a: number } // t in ms, a = cumulative clockwise angle in rad (negative = counter-clockwise)
export interface Launch { strength: number; speed: number; dir: 1 | -1 } // strength 0..1, speed in rad/s, dir +1 clockwise / -1 counter-clockwise

/** Flick on the wheel, either direction. Returns the launch, or null for a slow / short / paused release
 *  (then the wheel simply stays where it was put). The release itself must be the last sample. */
export function flick(samples: Sample[], drag: number, cfg: { minAngle: number; minSpeed: number; maxSpeed: number } = CONFIG.flick): Launch | null {
  if (samples.length < 2) return null;
  const end = samples[samples.length - 1], from = samples.find((s) => end.t - s.t <= 100) ?? samples[0], dt = (end.t - from.t) / 1000;
  if (dt <= 0) return null;
  const v = (end.a - from.a) / dt, speed = Math.abs(v);
  if (speed < cfg.minSpeed || Math.abs(drag) < cfg.minAngle) return null;
  return { strength: Math.min(1, (speed - cfg.minSpeed) / (cfg.maxSpeed - cfg.minSpeed)), speed, dir: v > 0 ? 1 : -1 };
}