import { useEffect, useRef } from 'react';
import { CONFIG } from '../config';
import { angleAt, anchoredTheta, arcs, makeSpinPlan, TAU, type Outcome, type SpinPlan } from '../game/spinPlan';
import { flapAt, pegModel, pegsCrossed, planSpin, type PegModel } from '../game/physics';

export interface SpinRequest { id: number; outcome: Outcome }
interface Props { p: number; spin: SpinRequest | null; onSettled: (id: number) => void; onTick: () => void }
const geo = (w: number) => { const R = w * 0.44, rB = R - w * 0.09; return { c: w / 2, R, rB, rF: rB - w * 0.014, hub: w * 0.07 }; };
const layer = (w: number) => { const e = document.createElement('canvas'); e.width = e.height = w; return e; };

export function Wheel({ p, spin, onSettled, onTick }: Props) {
  const cv = useRef<HTMLCanvasElement>(null), kick = useRef<() => void>(() => {});
  const cbs = useRef({ onSettled, onTick }); cbs.current = { onSettled, onTick };
  const S = useRef({ theta: 0, prev: 0, dir: 1, flap: 0, p, target: p, mp: -1, model: null as unknown as PegModel, plan: null as SpinPlan | null,
    t0: 0, raf: 0, id: -1, out: 'win' as Outcome, glow: null as null | { win: boolean; t0: number } });

  useEffect(() => {
    const s = S.current, el = cv.current!, ctx = el.getContext('2d')!;
    let back = layer(1), front = layer(1);
    const metal = (g: CanvasRenderingContext2D, c: number, st: [number, string][]) => { const k = g.createConicGradient(0.5, c, c); st.forEach(([o, col]) => k.addColorStop(o, col)); return k; };
    const bake = (w: number) => {
      const { c, R, rB, rF } = geo(w); back = layer(w); front = layer(w);
      const b = back.getContext('2d')!, f = front.getContext('2d')!;
      b.save(); b.shadowColor = 'rgba(0,0,0,.85)'; b.shadowBlur = w * 0.05; b.shadowOffsetY = w * 0.025; b.fillStyle = '#18161a'; b.beginPath(); b.arc(c, c, R, 0, TAU); b.fill(); b.restore();
      b.fillStyle = metal(b, c, [[0, '#6f747d'], [.09, '#eef1f5'], [.2, '#454a52'], [.36, '#b9bec7'], [.5, '#5e6267'], [.66, '#dde1e7'], [.82, '#525761'], [1, '#6f747d']]);
      b.beginPath(); b.arc(c, c, R, 0, TAU); b.fill();
      const bev = b.createRadialGradient(c, c, rB, c, c, R); bev.addColorStop(0, 'rgba(0,0,0,.35)'); bev.addColorStop(.15, 'rgba(0,0,0,0)'); bev.addColorStop(.85, 'rgba(255,255,255,.12)'); bev.addColorStop(1, 'rgba(0,0,0,.5)');
      b.fillStyle = bev; b.beginPath(); b.arc(c, c, R, 0, TAU); b.fill();
      b.lineWidth = w * 0.003; b.strokeStyle = 'rgba(255,255,255,.4)'; b.beginPath(); b.arc(c, c, R - w * 0.008, 0, TAU); b.stroke();
      for (let i = 0; i < 12; i++) { // hex-head bolts
        const a = (i / 12) * TAU + 0.26, x = c + Math.cos(a) * (R + rB) / 2, y = c + Math.sin(a) * (R + rB) / 2, r = w * 0.0175;
        const g = b.createRadialGradient(x - r * .35, y - r * .35, r * .1, x, y, r); g.addColorStop(0, '#f2f4f7'); g.addColorStop(.55, '#8b9099'); g.addColorStop(1, '#2b2e34');
        b.fillStyle = g; b.beginPath(); b.arc(x, y, r, 0, TAU); b.fill(); b.strokeStyle = 'rgba(0,0,0,.6)'; b.lineWidth = w * 0.002; b.stroke();
        b.beginPath(); b.moveTo(x - Math.cos(a * 3) * r * .7, y - Math.sin(a * 3) * r * .7); b.lineTo(x + Math.cos(a * 3) * r * .7, y + Math.sin(a * 3) * r * .7); b.lineWidth = w * 0.003; b.stroke();
      }
      b.fillStyle = '#060506'; b.beginPath(); b.arc(c, c, rB, 0, TAU); b.fill(); // recess
      f.save(); f.beginPath(); f.arc(c, c, rF, 0, TAU); f.clip();
      const sh = f.createRadialGradient(c, c, rF * 0.78, c, c, rF); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.5)'); f.fillStyle = sh; f.fillRect(0, 0, w, w);
      const gl = f.createLinearGradient(c - rF * .8, c - rF * .9, c + rF * .3, c + rF * .3); gl.addColorStop(0, 'rgba(255,255,255,.2)'); gl.addColorStop(.45, 'rgba(255,255,255,.05)'); gl.addColorStop(.5, 'rgba(255,255,255,0)');
      f.fillStyle = gl; f.beginPath(); f.ellipse(c - rF * .22, c - rF * .3, rF * .85, rF * .6, -0.6, 0, TAU); f.fill(); f.restore();
      f.strokeStyle = 'rgba(255,255,255,.22)'; f.lineWidth = w * 0.003; f.beginPath(); f.arc(c, c, rF + w * 0.004, Math.PI * 1.05, Math.PI * 1.45); f.stroke();
    };
    const face = (th: number) => {
      const w = el.width, { c, rF, hub } = geo(w), m = s.model;
      const mk = (a: string, b: string, d: string) => { const g = ctx.createRadialGradient(c, c, hub, c, c, rF); g.addColorStop(0, a); g.addColorStop(.72, b); g.addColorStop(1, d); return g; };
      const safe = mk('#23b862', '#13803f', '#0a5a2b'), bad = mk('#c3202f', '#9a1422', '#6f0c18');
      const A = arcs(s.p);
      for (const a of A) { ctx.beginPath(); ctx.moveTo(c, c); ctx.arc(c, c, rF + 2, a.start + th, a.end + th); ctx.closePath(); ctx.fillStyle = a.safe ? safe : bad; ctx.fill(); }
      for (const a of A) { // steel divider strips
        const x = Math.cos(a.start + th), y = Math.sin(a.start + th);
        ctx.lineCap = 'butt'; ctx.strokeStyle = '#050506'; ctx.lineWidth = w * 0.013; ctx.beginPath(); ctx.moveTo(c + x * hub, c + y * hub); ctx.lineTo(c + x * rF, c + y * rF); ctx.stroke();
        ctx.strokeStyle = '#a7adb6'; ctx.lineWidth = w * 0.0055; ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = w * 0.0014; ctx.stroke();
      }
      for (const g of m.pegs) { // brass studs; larger ones mark colour boundaries
        const a = g.phi + th, r = g.major ? w * 0.0125 : w * 0.0065, x = c + Math.cos(a) * (rF - w * 0.024), y = c + Math.sin(a) * (rF - w * 0.024);
        ctx.fillStyle = '#4e3a10'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
        ctx.fillStyle = '#e9cd80'; ctx.beginPath(); ctx.arc(x - r * .15, y - r * .15, r * .65, 0, TAU); ctx.fill();
      }
    };
    const draw = (now: number) => {
      const w = el.width; if (!w) return; const { c, R, rF } = geo(w);
      ctx.clearRect(0, 0, w, w);
      if (s.glow) { const age = (now - s.glow.t0) / 1800; if (age < 1) { const a = (1 - age) ** 1.6, col = s.glow.win ? '47,224,131' : '255,50,64', g = ctx.createRadialGradient(c, c, R * .96, c, c, w * .5); g.addColorStop(0, `rgba(${col},${Math.min(1, a * .95)})`); g.addColorStop(.35, `rgba(${col},${a * .5})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, w, w); } } // radius ends at the canvas edge, so it never gets cut flat
      ctx.drawImage(back, 0, 0);
      ctx.save(); ctx.beginPath(); ctx.arc(c, c, rF, 0, TAU); ctx.clip();
      const d = s.theta - s.prev, n = Math.min(8, Math.max(1, Math.ceil(Math.abs(d) / 0.06)));
      for (let i = 0; i < n; i++) { ctx.globalAlpha = 1 / (i + 1); face(s.theta - (d * i) / n); } // accumulation motion blur
      ctx.restore(); ctx.globalAlpha = 1; ctx.drawImage(front, 0, 0);
      const { hub } = geo(w);
const hg = ctx.createRadialGradient(c - hub * .3, c - hub * .3, hub * .1, c, c, hub); hg.addColorStop(0, '#f3f5f8'); hg.addColorStop(.5, '#7b808a'); hg.addColorStop(1, '#25282d');
ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(c, c, hub, 0, TAU); ctx.fill(); ctx.strokeStyle = '#050506'; ctx.lineWidth = w * 0.006; ctx.stroke();
ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = w * 0.003; ctx.beginPath(); ctx.arc(c, c, hub * .62, 0, TAU); ctx.stroke();
if (Math.abs(s.theta - s.prev) < 0.12) for (let i = 0; i < 6; i++) { const a = s.theta + (i / 6) * TAU; ctx.fillStyle = '#20232a'; ctx.beginPath(); ctx.arc(c + Math.cos(a) * hub * .8, c + Math.sin(a) * hub * .8, w * 0.0045, 0, TAU); ctx.fill(); }
      const px = c, py = c - R - w * 0.012, tip = R - rF + w * 0.115, ang = -s.dir * s.flap * 0.4; // spring flapper flexes on each peg
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang); ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = w * 0.02; ctx.shadowOffsetY = w * 0.012;
      const pg = ctx.createLinearGradient(-w * .03, 0, w * .03, 0); pg.addColorStop(0, '#7d5f22'); pg.addColorStop(.5, '#f5de98'); pg.addColorStop(1, '#6f531c');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(0, tip); ctx.lineTo(-w * .029, w * .02); ctx.quadraticCurveTo(0, -w * .02, w * .029, w * .02); ctx.closePath(); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#2a1e07'; ctx.lineWidth = w * 0.003; ctx.stroke();
      const bg = ctx.createRadialGradient(-w * .004, -w * .004, 1, 0, 0, w * .014); bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#4b4f57');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, w * .008, w * 0.0125, 0, TAU); ctx.fill(); ctx.restore();
    };
    const model = () => { if (Math.abs(s.p - s.mp) > 0.002 || !s.model) { s.model = pegModel(s.p); s.mp = s.p; } };
    const fit = () => { const q = Math.round(el.clientWidth * Math.min(window.devicePixelRatio || 1, 2)); if (q && el.width !== q) { el.width = el.height = q; bake(q); } model(); s.prev = s.theta; draw(performance.now()); };
    const loop = (now: number) => {
      s.raf = 0; let more = false; s.prev = s.theta;
      if (s.plan) {
        if (!s.t0) s.t0 = now;
        const t = now - s.t0;
        if (t >= s.plan.total) { s.theta = s.plan.finalTheta; s.plan = null; s.glow = { win: s.out === 'win', t0: now }; cbs.current.onSettled(s.id); }
        else { s.theta = angleAt(s.plan, t); more = true; if (pegsCrossed(s.model, s.prev, s.theta)) cbs.current.onTick(); }
     } else if (Math.abs(s.p - s.target) > 1e-4) { const was = s.p; s.p += (s.target - s.p) * 0.16; s.theta = anchoredTheta(s.theta, was, s.p); more = true; } else s.p = s.target;
      model();
      if (Math.abs(s.theta - s.prev) > 1e-5) s.dir = Math.sign(s.theta - s.prev);
      s.flap += ((s.plan ? flapAt(s.model, s.theta) : 0) - s.flap) * 0.6; if (s.flap > 0.01) more = true;
      if (s.glow && now - s.glow.t0 < 1800) more = true;
      draw(now); if (more) s.raf = requestAnimationFrame(loop);
    };
    kick.current = () => { if (!s.raf) s.raf = requestAnimationFrame(loop); };
    const ro = new ResizeObserver(fit); ro.observe(el); fit();
    return () => { cancelAnimationFrame(s.raf); s.raf = 0; ro.disconnect(); };
  }, []);

  useEffect(() => { S.current.target = p; kick.current(); }, [p]);
  useEffect(() => {
    if (!spin) return;
    const s = S.current, slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.p = s.target = p; s.model = pegModel(p); s.mp = p; s.id = spin.id; s.out = spin.outcome; s.t0 = 0; s.glow = null;
    s.plan = slow ? makeSpinPlan(p, spin.outcome, s.theta, { ...CONFIG.spin, durationMs: 1500 }, Math.random) : planSpin(p, spin.outcome, s.theta, Math.random);
    kick.current();
  }, [spin?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={cv} className="wheel" role="img" aria-label="Wheel of safe green and dangerous red sections" />;
}
