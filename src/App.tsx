/**
 * Copyright © 2026 Milutin Erdevicki.
 * All rights reserved.
 *
 * Proprietary and confidential.
 * Unauthorized copying, modification, distribution,
 * or commercial use is prohibited.
 */
import { useEffect, useRef, useState } from 'react';
import { CONFIG } from './config';
import { LADDER } from './game/math';
import { acknowledge, cashOut, closePartial, initialRun, newRun, openPartial, quote, resolve, secureRandom, spin, successChance, type Run } from './game/engine';
import { Wheel, type SpinRequest } from './ui/Wheel';
import * as audio from './ui/audio';
import type { Launch } from './ui/gesture';

const money = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
const svg = { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
const SoundOn = () => <svg {...svg}><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /></svg>;
const SoundOff = () => <svg {...svg}><path d="M4 9v6h4l5 4V5L8 9H4z" /><path d="M17 9l5 6M22 9l-5 6" /></svg>;

/** `initial` only exists so tests can render any game state. */
export function App({ initial }: { initial?: Run }) {
  const [run, setRun] = useState<Run>(initial ?? initialRun);
  const runRef = useRef(run);
  const [stake, setStake] = useState(10);
  const [balance, setBalance] = useState(CONFIG.startingBalance * 100);
  const [fraction, setFraction] = useState(0.5);
  const [req, setReq] = useState<SpinRequest | null>(null);
  const [muted, setMuted] = useState(false);
  const [help, setHelp] = useState(false);
  const [logoOk, setLogoOk] = useState(true);
  const [intro, setIntro] = useState(() => { try { return !localStorage.getItem('dw-intro'); } catch { return true; } });
  const [nudge, setNudge] = useState(false);
  const touch = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  const idRef = useRef(0), timer = useRef<number>(0), helpBtn = useRef<HTMLButtonElement>(null);
  const commit = (r: Run) => { runRef.current = r; setRun(r); };
  const closeHelp = () => { setHelp(false); helpBtn.current?.focus(); };
  const dismissIntro = () => { setIntro(false); try { localStorage.setItem('dw-intro', '1'); } catch { /* private mode: it just shows again next visit */ } };
  useEffect(() => {
    if (!intro) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') dismissIntro(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [intro]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { audio.sound.muted = muted; }, [muted]);
  useEffect(() => { document.title = CONFIG.title; }, []);
  useEffect(() => {
    if (!help && run.phase !== 'partial') return;
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (help) closeHelp(); else commit(closePartial(runRef.current)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [help, run.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSpin = (r: Run, launch?: Launch) => {
    const out = spin(r, secureRandom);
    if (out.run === r) return;
    commit(out.run); setReq({ id: ++idRef.current, outcome: out.run.pending!, launch });
  };
  const start = (launch?: Launch) => {
    const c = stake * 100;
    if (runRef.current.phase !== 'ready' || c > balance) return;
    audio.unlock(); setBalance((b) => b - c); doSpin(newRun(c), launch);
  };
  const spinAgain = (launch?: Launch) => { if (runRef.current.phase === 'choosing') { audio.unlock(); doSpin(runRef.current, launch); } };
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || help || intro) return;
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,[role=dialog]')) return;                     // sliders and sheets keep their own Space
      if (t instanceof HTMLButtonElement && !t.matches('.go,.big.spin')) return; // Space on Cash Out, chips and icons still clicks them
      const r = runRef.current;
      if (r.phase === 'ready') { e.preventDefault(); start(); }
      else if (r.phase === 'choosing') { e.preventDefault(); spinAgain(); }
    };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  });
  const settled = (id: number) => {
    if (id !== idRef.current || runRef.current.phase !== 'spinning') return;
    const before = runRef.current, r = resolve(before);
    commit(r); audio.result(r.phase !== 'failed');
    if (r.phase === 'cashedOut') setBalance((b) => b + r.secured - before.secured);
    if (r.phase === 'success') timer.current = window.setTimeout(() => commit(acknowledge(runRef.current)), 650);
  };
  const take = (f: number) => {
    const before = runRef.current, after = cashOut(before, f);
    if (after === before) return;
    setBalance((b) => b + after.secured - before.secured); commit(after);
  };
  const playAgain = () => { setReq(null); commit(initialRun()); };

  const { phase } = run, finished = phase === 'cashedOut' || phase === 'failed', ready = phase === 'ready';
  const choosing = phase === 'choosing', partial = phase === 'partial', spinning = phase === 'spinning';
  const live = !ready && !finished;
  const q = live ? quote(run, fraction) : null, qAll = live ? quote(run, 1) : null;
  const pSafe = successChance(Math.min(run.cleared, LADDER.length - 1));
  const stakeC = stake * 100;
  useEffect(() => {
    if (!touch || intro || !(ready || choosing)) return;
    let shown = 0; try { shown = +(localStorage.getItem('dw-nudge') ?? 0); } catch { /* ignore */ }
    if (shown >= 2) return;
    const on = window.setTimeout(() => { setNudge(true); try { localStorage.setItem('dw-nudge', String(shown + 1)); } catch { /* ignore */ } }, 7000);
    const off = window.setTimeout(() => setNudge(false), 11500);
    const stop = () => { window.clearTimeout(on); window.clearTimeout(off); setNudge(false); };
    window.addEventListener('pointerdown', stop, { once: true });
    return () => { stop(); window.removeEventListener('pointerdown', stop); };
  }, [ready, choosing, intro]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main className="app">
      <header>
        <h1>{logoOk ? <img className="logo" src={`${import.meta.env.BASE_URL}${CONFIG.logo}`} alt={CONFIG.title} onError={() => setLogoOk(false)} /> : CONFIG.title}</h1>
        <div className="tools">
          <button className="icon" aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted} onClick={() => setMuted((m) => !m)}>{muted ? <SoundOff /> : <SoundOn />}</button>
          <button className="icon text" ref={helpBtn} aria-haspopup="dialog" onClick={() => setHelp(true)}>Help</button>
          <span className="bal" aria-label={`Balance ${money(balance)}`}>{money(balance)}</span>
        </div>
      </header>

      <section className="stage">
        <Wheel
          p={pSafe}
          spin={req}
          onSettled={settled}
          onTick={audio.tick}
          canSpin={ready ? stakeC <= balance : choosing}
          onFlick={(l) => (ready ? start(l) : spinAgain(l))}
        />

        {nudge && (
          <div className="nudge" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="22"
              height="22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 12h14M13 6l6 6-6 6" />
            </svg>
            <span>Flick the wheel to spin</span>
          </div>
        )}
      </section>

      <section className="actions">
        {ready && (
          <div className="panel bet">
            <div className="chips">{CONFIG.stake.presets.map((s) => <button key={s} className={s === stake ? 'on' : ''} aria-pressed={s === stake} onClick={() => setStake(s)}>${s}</button>)}</div>
            <label className="slide"><span>Stake</span><input type="range" min={CONFIG.stake.min} max={CONFIG.stake.max} value={stake} onChange={(e) => setStake(+e.target.value)} /><b>${stake}</b></label>
            <button className="primary go" onClick={() => start()} disabled={stakeC > balance} aria-keyshortcuts="Space">Place Bet</button>
            {stakeC > balance && <button className="link" onClick={() => setBalance(CONFIG.startingBalance * 100)}>Not enough balance. Reset to {money(CONFIG.startingBalance * 100)}</button>}
          </div>
        )}
        {live && qAll && (
          <>
            <div className="decide">
              <button className="big spin" disabled={!choosing} onClick={() => spinAgain()} aria-keyshortcuts="Space" aria-label={`Spin again. Pays ${money(qAll.nextValue)} if safe`}>
                <span className="t">Spin Again</span><span className="s">{spinning ? 'Spinning…' : `Win ${money(qAll.nextValue)}`}</span>
              </button>
              <button className="big cash" disabled={!choosing} onClick={() => commit(openPartial(run))} aria-label={`Cash out. Choose how much to collect, up to ${money(qAll.total)}`} aria-haspopup="dialog">
                <span className="t">Cash Out</span><span className="s">{spinning ? '—' : money(qAll.total)}</span>
              </button>
            </div>
          </>
        )}
        {finished && (
          <div className={`panel result ${phase}`} role="status">
            <h2>{phase === 'failed' ? 'GAME OVER' : run.cleared === LADDER.length ? 'WON' : 'CASHED OUT'}</h2>
            <p className="amt">{money(run.secured)} <span>collected</span></p>
            <button className="primary" onClick={playAgain} autoFocus>Play Again</button>
          </div>
        )}
      </section>

      {partial && q && qAll && (
        <div className="backdrop end" onClick={() => commit(closePartial(run))}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Cash out" onClick={(e) => e.stopPropagation()}>
            <div className="sheethead"><h2>Cash out</h2><button className="link" onClick={() => commit(closePartial(run))}>Back</button></div>
            <button className="big cash wide" onClick={() => take(1)} autoFocus><span className="t">Cash out all</span><span className="s">{money(qAll.total)}</span></button>
            <p className="or">Or secure part and keep spinning</p>
            <div className="chips">{[0.25, 0.5, 0.75].map((f) => <button key={f} className={f === fraction ? 'on' : ''} aria-pressed={f === fraction} onClick={() => setFraction(f)}>{f * 100}%</button>)}</div>
            <input type="range" min={5} max={95} value={Math.round(fraction * 100)} onChange={(e) => setFraction(+e.target.value / 100)} aria-label="Share to secure" />
            <dl>
              <dt>Secure now</dt><dd className="ok">{money(q.secure)}</dd>
              <dt>Keep in play</dt><dd className="risk">{money(q.remaining)}</dd>
              <dt>Keep-in-play value if next spin is safe</dt><dd>{money(q.remainingIfSurvive)}</dd>
            </dl>
            <button className="big cash" onClick={() => take(fraction)}><span className="t">Secure {money(q.secure)}</span><span className="s">and keep spinning</span></button>
          </div>
        </div>
      )}

     {intro && ready && (
        <div className="backdrop" onClick={dismissIntro}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="intro-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="intro-title">Welcome to Danger Wheel</h2>
            <dl>
              <dt>Spin</dt><dd>Choose your stake and press <strong>Place Bet</strong> to spin the wheel.</dd>
              <dt>Decide</dt><dd>After each winning spin, cash out all or part, or keep going. Landing on red ends the run.</dd>
              <dt>Controls</dt><dd>Drag the wheel to adjust it before you spin. Press Space or {touch ? 'flick' : 'drag and flick'} the wheel to bet.</dd>
            </dl>
            <button className="primary" onClick={dismissIntro} autoFocus>Let's go</button>
          </div>
        </div>
      )}

      {help && (
        <div className="backdrop" onClick={closeHelp}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="help-title">How to play</h2>
            <p className="lede">{CONFIG.tagline}</p>
            <dl>
              <dt>The wheel</dt><dd>Green means survive. Red means lose. Each successful spin increases your multiplier.</dd>
              <dt>Rising danger</dt><dd>Red starts at {CONFIG.odds.failurePercent[0]}% and increases each round, up to {CONFIG.odds.plateauFailurePercent}%.</dd>
              <dt>Cash out or Spin again</dt><dd>Cash out to secure your winnings. You can also cash out part and keep the rest in play.</dd>
              <dt>Maximum payout</dt><dd>{CONFIG.maxMultiplier.toLocaleString('en-US')}× your original stake per bet, including previous cash-outs.</dd>
              <dt>Controls</dt><dd>Drag the wheel to turn it. Flick it either direction, press Space, or use the button to spin.</dd>
            </dl>
            <p className="fine">Play-money prototype. Not certified and not for real-money use.</p>
            <button className="primary" onClick={closeHelp} autoFocus>Got it</button>
          </div>
        </div>
      )}
    </main>
  );
}
