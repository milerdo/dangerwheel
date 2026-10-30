import { useEffect, useRef } from 'react';
import { CONFIG } from '../config';
import { angleAt, anchoredTheta, arcs, makeSpinPlan, TAU, type Outcome, type SpinPlan } from '../game/spinPlan';
import { flapAt, pegHits, pegModel, planSpin, type PegModel } from '../game/physics';
import { stepArm, type Arm } from './flapper';
import { flick, type Launch, type Sample } from './gesture';

export interface SpinRequest { id: number; outcome: Outcome; launch?: Launch }
interface Props { p: number; spin: SpinRequest | null; onSettled: (id: number) => void; onTick: (speed: number, major: boolean, reverse: boolean) => void; canSpin: boolean; onFlick: (launch: Launch) => void }
const geo = (w: number) => { const R = w * 0.44, rB = R - w * 0.09; return { c: w / 2, R, rB, rF: rB - w * 0.014, hub: w * 0.07 }; };
const layer = (w: number) => { const e = document.createElement('canvas'); e.width = e.height = w; return e; };

export function Wheel({ p, spin, onSettled, onTick, canSpin, onFlick }: Props) {
  const cv = useRef<HTMLCanvasElement>(null), kick = useRef<() => void>(() => {});
  const cbs = useRef({ onSettled, onTick, canSpin, onFlick }); cbs.current = { onSettled, onTick, canSpin, onFlick };
  const S = useRef({ theta: 0, prev: 0, dir: 1, flap: 0, arm: { a: 0, v: 0, u: 0 } as Arm, last: 0, lastDir: 0,
    drag: null as null | { last: number; rest: number; cum: number; samples: Sample[] }, back: null as number | null, coast: 0, p, target: p, mp: -1, model: null as unknown as PegModel, plan: null as SpinPlan | null,
    t0: 0, raf: 0, id: -1, out: 'win' as Outcome, glow: null as null | { win: boolean; t0: number } });

  useEffect(() => {
    const s = S.current, el = cv.current!, ctx = el.getContext('2d')!;
    let back = layer(1), front = layer(1), sprites = { minor: layer(1), major: layer(1) };
    const metal = (g: CanvasRenderingContext2D, c: number, st: [number, string][]) => { const k = g.createConicGradient(0.5, c, c); st.forEach(([o, col]) => k.addColorStop(o, col)); return k; };
    const bake = (w: number) => {
      const { c, R, rB, rF } = geo(w); back = layer(w); front = layer(w);
      const dome = (r: number, hi: string, mid: string, lo: string) => { // pre-rendered brass stud with contact shadow (light from top-left)
        const d = Math.ceil(r * 3.8), e = layer(d), g = e.getContext('2d')!, m = d / 2;
        g.save(); g.shadowColor = 'rgba(0,0,0,.65)'; g.shadowBlur = r * 0.7; g.shadowOffsetX = r * 0.25; g.shadowOffsetY = r * 0.35; g.fillStyle = lo; g.beginPath(); g.arc(m, m, r, 0, TAU); g.fill(); g.restore();
        const k = g.createRadialGradient(m - r * .35, m - r * .4, r * .1, m, m, r); k.addColorStop(0, hi); k.addColorStop(.55, mid); k.addColorStop(1, lo);
        g.fillStyle = k; g.beginPath(); g.arc(m, m, r, 0, TAU); g.fill(); g.strokeStyle = 'rgba(40,28,6,.8)'; g.lineWidth = Math.max(1, r * .12); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.arc(m - r * .32, m - r * .36, r * .22, 0, TAU); g.fill(); return e;
      };
      sprites = { minor: dome(w * 0.0095, '#fff1c2', '#d6b25a', '#6e5320'), major: dome(w * 0.0165, '#fff6d6', '#e3bf63', '#6a4d14') };
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
      for (const g of m.pegs) { // brass studs (pre-rendered); larger ones mark colour boundaries
        const a = g.phi + th, x = c + Math.cos(a) * (rF - w * 0.024), y = c + Math.sin(a) * (rF - w * 0.024), sp = g.major ? sprites.major : sprites.minor;
        ctx.drawImage(sp, x - sp.width / 2, y - sp.height / 2);
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
      const { hub } = geo(w); // hub: drawn once, fully opaque, above the glass (bolts hidden at speed, where they would only strobe)
      const hg = ctx.createRadialGradient(c - hub * .3, c - hub * .3, hub * .1, c, c, hub); hg.addColorStop(0, '#f3f5f8'); hg.addColorStop(.5, '#7b808a'); hg.addColorStop(1, '#25282d');
      ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(c, c, hub, 0, TAU); ctx.fill(); ctx.strokeStyle = '#050506'; ctx.lineWidth = w * 0.006; ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = w * 0.003; ctx.beginPath(); ctx.arc(c, c, hub * .62, 0, TAU); ctx.stroke();
      if (Math.abs(s.theta - s.prev) < 0.12) for (let i = 0; i < 6; i++) { const a = s.theta + (i / 6) * TAU; ctx.fillStyle = '#20232a'; ctx.beginPath(); ctx.arc(c + Math.cos(a) * hub * .8, c + Math.sin(a) * hub * .8, w * 0.0045, 0, TAU); ctx.fill(); }
// spring flapper: pivots above the rim; its tip rides in the stud path so pegs knock it aside, then it rings back
      const px = c, py = c - R - w * 0.004, len = R + w * 0.004 - (rF - w * 0.024);
      ctx.save(); ctx.translate(px, py); ctx.rotate(-s.arm.a);
      ctx.shadowColor = 'rgba(0,0,0,.7)'; ctx.shadowBlur = w * 0.012; ctx.shadowOffsetX = w * 0.004; ctx.shadowOffsetY = w * 0.01;
      const ag = ctx.createLinearGradient(-w * .017, 0, w * .017, 0); ag.addColorStop(0, '#7d5f22'); ag.addColorStop(.35, '#f7e3a1'); ag.addColorStop(.7, '#c9a24a'); ag.addColorStop(1, '#6a4e18');
      ctx.fillStyle = ag; ctx.beginPath(); ctx.moveTo(-w * .017, 0); ctx.lineTo(w * .017, 0); ctx.lineTo(w * .007, len); ctx.quadraticCurveTo(0, len + w * .012, -w * .007, len); ctx.closePath(); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#2a1e07'; ctx.lineWidth = w * 0.0028; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = w * 0.0015; ctx.beginPath(); ctx.moveTo(-w * .005, w * .012); ctx.lineTo(-w * .0025, len * .85); ctx.stroke();
      const bg = ctx.createRadialGradient(-w * .004, -w * .004, 1, 0, 0, w * .016); bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#4b4f57');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(0, 0, w * 0.0155, 0, TAU); ctx.fill(); ctx.strokeStyle = '#2a1e07'; ctx.stroke(); ctx.restore();
    };
    const model = () => { if (Math.abs(s.p - s.mp) > 0.002 || !s.model) { s.model = pegModel(s.p); s.mp = s.p; } };
    const fit = () => { const q = Math.round(el.clientWidth * Math.min(window.devicePixelRatio || 1, 2)); if (q && el.width !== q) { el.width = el.height = q; bake(q); } model(); s.prev = s.theta; draw(performance.now()); };
    const loop = (now: number) => {
      s.raf = 0; let more = false; s.prev = s.theta;
      const dt = Math.min(0.05, (now - (s.last || now - 16)) / 1000);
      if (s.plan) {
        if (!s.t0) s.t0 = now;
        const t = now - s.t0;
        if (t >= s.plan.total) { s.theta = s.plan.finalTheta; s.plan = null; s.glow = { win: s.out === 'win', t0: now }; cbs.current.onSettled(s.id); }
        else {
          s.theta = angleAt(s.plan, t); more = true;
          const sp = Math.abs(s.theta - s.prev) / dt, now_ = Math.sign(s.theta - s.prev); // wheel speed in rad/s
          pegHits(s.model, s.prev, s.theta).slice(0, 3).forEach((g) => cbs.current.onTick(sp, g.major, !!s.lastDir && now_ !== s.lastDir));
          if (now_) s.lastDir = now_;
        }
      } else if (s.drag || s.back !== null || s.coast) {
        if (s.drag) s.theta = s.drag.rest + s.drag.cum;                                   // follows the finger
        else if (s.back !== null) { s.theta += (s.back - s.theta) * 0.22; if (Math.abs(s.back - s.theta) < 0.002) { s.theta = s.back; s.back = null; } } // cancelled: glide home
        else { s.theta += s.coast * dt; s.coast *= 0.94; if (Math.abs(s.coast) < 0.05) s.coast = 0; }                    // keeps the finger's speed until the launch starts
        more = true;
        const sp = Math.abs(s.theta - s.prev) / dt;
        pegHits(s.model, s.prev, s.theta).slice(0, 2).forEach((g) => cbs.current.onTick(sp, g.major, false)); // pegs ratchet against the arm
      } else if (Math.abs(s.p - s.target) > 1e-4) { const was = s.p; s.p += (s.target - s.p) * 0.16; s.theta = anchoredTheta(s.theta, was, s.p); more = true; } else s.p = s.target;
      model();
      if (Math.abs(s.theta - s.prev) > 1e-5) s.dir = Math.sign(s.theta - s.prev);
      stepArm(s.arm, dt, s.plan || s.drag || s.coast || s.back !== null ? flapAt(s.model, s.theta) : 0, s.dir || 1);
      if (Math.abs(s.arm.a) > 0.002 || Math.abs(s.arm.v) > 0.05) more = true;
      if (s.glow && now - s.glow.t0 < 1800) more = true;
      s.last = now; draw(now); if (more) s.raf = requestAnimationFrame(loop);
    };
    kick.current = () => { if (!s.raf) s.raf = requestAnimationFrame(loop); };
    const aOf = (e: PointerEvent) => { const r = el.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2; return { a: Math.atan2(y, x), d: Math.hypot(x, y) / r.width }; };
    const down = (e: PointerEvent) => { // drag the wheel with a finger / mouse; a quick clockwise flick launches it
      if (!CONFIG.flick.enabled || !cbs.current.canSpin || s.plan || s.drag || aOf(e).d < 0.08) return;
      s.drag = { last: aOf(e).a, rest: s.theta, cum: 0, samples: [{ t: e.timeStamp, a: 0 }] }; s.back = null; el.setPointerCapture(e.pointerId); kick.current();
    };
    const move = (e: PointerEvent) => {
      const d = s.drag; if (!d) return; const { a, d: dist } = aOf(e); if (dist < 0.08) return;
      d.cum += Math.atan2(Math.sin(a - d.last), Math.cos(a - d.last)); d.last = a;
      d.samples.push({ t: e.timeStamp, a: d.cum }); if (d.samples.length > 12) d.samples.shift();
    };
    const up = (e: PointerEvent) => {
      const d = s.drag; if (!d) return; s.drag = null;
      if (e.type === 'pointercancel') { s.back = d.rest; kick.current(); return; } // interrupted: glide back
      d.samples.push({ t: e.timeStamp, a: d.cum }); // the release itself counts, so a pause before letting go is not a flick
      const L = cbs.current.canSpin ? flick(d.samples, d.cum) : null;
      if (L) { s.coast = L.dir * Math.min(L.speed, 30); cbs.current.onFlick(L); } // a slow release just leaves the wheel where it was put
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape' && s.drag) { s.back = s.drag.rest; s.drag = null; kick.current(); } }; // Esc while holding the wheel: cancel, glide home
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); window.addEventListener('keydown', esc);
    const ro = new ResizeObserver(fit); ro.observe(el); fit();
    return () => { cancelAnimationFrame(s.raf); s.raf = 0; ro.disconnect(); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); window.removeEventListener('keydown', esc); };
  }, []);

  useEffect(() => { S.current.target = p; kick.current(); }, [p]);
  useEffect(() => {
    if (!spin) return;
    const s = S.current, slow = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    s.p = s.target = p; s.model = pegModel(p); s.mp = p; s.id = spin.id; s.out = spin.outcome; s.t0 = 0; s.glow = null; s.last = 0; s.lastDir = 0; s.coast = 0; s.back = null; s.drag = null;
    s.plan = slow ? makeSpinPlan(p, spin.outcome, s.theta, { ...CONFIG.spin, durationMs: 1500 }, Math.random) : planSpin(p, spin.outcome, s.theta, Math.random, spin.launch ? { strength: spin.launch.strength, skip: true, dir: spin.launch.dir, speed: spin.launch.speed } : undefined);
    kick.current();
  }, [spin?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <canvas ref={cv} className={`wheel${canSpin ? ' grab' : ''}`} role="img" aria-label="Wheel of safe green and dangerous red sections" />;
}
