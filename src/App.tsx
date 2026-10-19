import { useEffect, useRef, useState } from 'react';
import { CONFIG } from './config';
import { LADDER } from './game/math';
import { acknowledge, cashOut, closePartial, initialRun, newRun, openPartial, quote, resolve, secureRandom, spin, successChance, type Run } from './game/engine';
import { Wheel, type SpinRequest } from './ui/Wheel';
import * as audio from './ui/audio';

const money = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
const mult = (m: number) => `${m.toLocaleString('en-US', { maximumFractionDigits: m < 10 ? 2 : m < 1000 ? 1 : 0 })}×`;
const pct = (p: number) => `${+(p * 100).toFixed(1)}%`;
const net = (c: number) => (c >= 0 ? '+' : '−') + money(Math.abs(c));
const svg = { viewBox: '0 0 24 24', width: 20, height: 20, fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;
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
  const idRef = useRef(0), timer = useRef<number>(0), helpBtn = useRef<HTMLButtonElement>(null);
  const commit = (r: Run) => { runRef.current = r; setRun(r); };
  const closeHelp = () => { setHelp(false); helpBtn.current?.focus(); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { audio.sound.muted = muted; }, [muted]);
  useEffect(() => { document.title = CONFIG.title; }, []);
  useEffect(() => {
    if (!help && run.phase !== 'partial') return;
    const k = (e: KeyboardEvent) => { if (e.key !== 'Escape') return; if (help) closeHelp(); else commit(closePartial(runRef.current)); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [help, run.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  const doSpin = (r: Run) => {
    const out = spin(r, secureRandom);
    if (out.run === r) return;
    commit(out.run); setReq({ id: ++idRef.current, outcome: out.run.pending! });
  };
  const start = () => {
    const c = stake * 100;
    if (runRef.current.phase !== 'ready' || c > balance) return;
    audio.unlock(); setBalance((b) => b - c); doSpin(newRun(c));
  };
  const spinAgain = () => { if (runRef.current.phase === 'choosing') { audio.unlock(); doSpin(runRef.current); } };
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
  const round = ready ? 1 : phase === 'failed' ? run.cleared + 1 : phase === 'cashedOut' ? Math.max(1, run.cleared) : run.cleared + 1;
  const pSafe = successChance(Math.min(run.cleared, LADDER.length - 1));
  const stakeC = stake * 100;

  return (
    <main className="app">
      <header>
        <h1>{CONFIG.title}</h1>
        <div className="tools">
          <span className="bal" aria-label={`Balance ${money(balance)}`}>{money(balance)}</span>
          <button className="icon" aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted} onClick={() => setMuted((m) => !m)}>{muted ? <SoundOff /> : <SoundOn />}</button>
          <button className="icon" ref={helpBtn} aria-label="How to play" aria-haspopup="dialog" onClick={() => setHelp(true)}>?</button>
        </div>
      </header>

      <section className="stage"><Wheel p={pSafe} spin={req} onSettled={settled} onTick={audio.tick} /></section>

      <section className="stats" aria-label="Game status">
        <div><span>Round</span><b>{round}</b></div>
        <div><span>Multiplier</span><b>{mult(run.multiplier)}</b></div>
        <div><span>Safe chance</span><b>{finished ? '—' : pct(pSafe)}</b></div>
        {run.secured > 0 && <div className="sec"><span>Secured</span><b>{money(run.secured)}</b></div>}
      </section>

      <section className="actions">
        {ready && (
          <div className="panel bet">
            <div className="chips">{CONFIG.stake.presets.map((s) => <button key={s} className={s === stake ? 'on' : ''} aria-pressed={s === stake} onClick={() => setStake(s)}>${s}</button>)}</div>
            <label className="slide"><span>Stake</span><input type="range" min={CONFIG.stake.min} max={CONFIG.stake.max} value={stake} onChange={(e) => setStake(+e.target.value)} /><b>${stake}</b></label>
            <button className="primary go" onClick={start} disabled={stakeC > balance}>Place Bet</button>
            {stakeC > balance && <button className="link" onClick={() => setBalance(CONFIG.startingBalance * 100)}>Not enough balance. Reset to {money(CONFIG.startingBalance * 100)}</button>}
          </div>
        )}
        {live && qAll && (
          <>
            <div className="decide">
              <button className="big spin" disabled={!choosing} onClick={spinAgain} aria-label={`Spin again. Pays ${money(qAll.nextValue)} if safe`}>
                <span className="t">Spin Again</span><span className="s">{spinning ? 'Spinning…' : `Win ${money(qAll.nextValue)}`}</span>
              </button>
              <button className="big cash" disabled={!choosing} onClick={() => take(1)} aria-label={`Cash out ${money(qAll.total)}`}>
                <span className="t">Cash Out</span><span className="s">{spinning ? '—' : money(qAll.total)}</span>
              </button>
            </div>
            <button className="link part" style={{ visibility: choosing ? 'visible' : 'hidden' }} tabIndex={choosing ? 0 : -1} onClick={() => commit(openPartial(run))}>Cash out part…</button>
          </>
        )}
        {finished && (
          <div className={`panel result ${phase}`} role="status">
            <h2>{phase === 'failed' ? 'You lost' : 'You cashed out'}</h2>
            <p>{phase === 'failed' ? (run.secured > 0 ? `Your secured ${money(run.secured)} is safe.` : `The wheel took your ${money(run.stake)} stake.`) : `${money(run.secured)} collected from a ${money(run.stake)} stake.`}</p>
            <p className="net">Net {net(run.secured - run.stake)}</p>
            <button className="primary" onClick={playAgain} autoFocus>Play Again</button>
          </div>
        )}
      </section>

      {partial && q && (
        <div className="backdrop end" onClick={() => commit(closePartial(run))}>
          <div className="sheet" role="dialog" aria-modal="true" aria-label="Cash out part" onClick={(e) => e.stopPropagation()}>
            <div className="chips">{[0.25, 0.5, 0.75].map((f) => <button key={f} className={f === fraction ? 'on' : ''} aria-pressed={f === fraction} onClick={() => setFraction(f)}>{f * 100}%</button>)}</div>
            <input type="range" min={5} max={95} value={Math.round(fraction * 100)} onChange={(e) => setFraction(+e.target.value / 100)} aria-label="Share to secure" />
            <dl>
              <dt>Secure now</dt><dd className="ok">{money(q.secure)}</dd>
              <dt>Keep in play</dt><dd className="risk">{money(q.remaining)}</dd>
              <dt>Keep-in-play value if next spin is safe</dt><dd>{money(q.remainingIfSurvive)}</dd>
            </dl>
            <div className="row"><button onClick={() => commit(closePartial(run))}>Back</button><button className="primary" onClick={() => take(fraction)} autoFocus>Secure {money(q.secure)}</button></div>
          </div>
        </div>
      )}

      {help && (
        <div className="backdrop" onClick={closeHelp}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="help-title">How to play</h2>
            <p className="lede">{CONFIG.tagline}</p>
            <dl>
              <dt>The wheel</dt><dd>Each spin lands on green or red. Green is safe: you survive and your multiplier grows. The share of green is your chance of surviving.</dd>
              <dt>Rising danger</dt><dd>Red starts at {CONFIG.odds.failurePercent[0]}% in round 1 and grows every round until it reaches {CONFIG.odds.plateauFailurePercent}/{100 - CONFIG.odds.plateauFailurePercent}.</dd>
              <dt>A failed spin</dt><dd>You lose the money still in play. Anything you already cashed out is yours to keep.</dd>
              <dt>Cashing out</dt><dd>After a safe spin, Cash Out collects everything in play. Cash out part secures some and keeps the rest spinning.</dd>
              <dt>Maximum payout</dt><dd>{CONFIG.maxMultiplier.toLocaleString('en-US')}× your stake in total, cashed-out money included. Reaching it pays out automatically.</dd>
            </dl>
            <p className="fine">Play-money prototype. Not certified and not for real-money use.</p>
            <button className="primary" onClick={closeHelp} autoFocus>Got it</button>
          </div>
        </div>
      )}
    </main>
  );
}
