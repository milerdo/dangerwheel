import { useEffect, useRef, useState } from 'react';
import { CONFIG } from './config';
import { LADDER } from './game/math';
import { acknowledge, cashOut, closePartial, initialRun, newRun, openPartial, quote, resolve, secureRandom, spin, successChance, type Run } from './game/engine';
import { Wheel, type SpinRequest } from './ui/Wheel';
import * as audio from './ui/audio';

const money = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
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
  const [logoOk, setLogoOk] = useState(true);
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
  const pSafe = successChance(Math.min(run.cleared, LADDER.length - 1));
  const stakeC = stake * 100;

  return (
    <main className="app">
      <header>
        <h1>{logoOk ? <img className="logo" src={`${import.meta.env.BASE_URL}${CONFIG.logo}`} alt={CONFIG.title} onError={() => setLogoOk(false)} /> : CONFIG.title}</h1>
        <div className="tools">
          <span className="bal" aria-label={`Balance ${money(balance)}`}>{money(balance)}</span>
          <button className="icon" aria-label={muted ? 'Turn sound on' : 'Turn sound off'} aria-pressed={!muted} onClick={() => setMuted((m) => !m)}>{muted ? <SoundOff /> : <SoundOn />}</button>
          <button className="icon" ref={helpBtn} aria-label="How to play" aria-haspopup="dialog" onClick={() => setHelp(true)}>?</button>
        </div>
      </header>

      <section className="stage"><Wheel p={pSafe} spin={req} onSettled={settled} onTick={audio.tick} /></section>

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
              <button className="big cash" disabled={!choosing} onClick={() => commit(openPartial(run))} aria-label={`Cash out. Choose how much to collect, up to ${money(qAll.total)}`} aria-haspopup="dialog">
                <span className="t">Cash Out</span><span className="s">{spinning ? '—' : money(qAll.total)}</span>
              </button>
            </div>
          </>
        )}
        {finished && (
          <div className={`panel result ${phase}`} role="status">
            <h2>{phase === 'failed' ? 'LOST' : run.cleared === LADDER.length ? 'WON' : 'CASHED OUT'}</h2>
            <p className="amt">{money(phase === 'failed' ? run.forfeited : run.secured)}</p>
            {phase === 'failed' && run.secured > 0 && <p className="note">Your secured {money(run.secured)} is safe.</p>}
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
            </dl>
            <p className="fine">Play-money prototype. Not certified and not for real-money use.</p>
            <button className="primary" onClick={closeHelp} autoFocus>Got it</button>
          </div>
        </div>
      )}
    </main>
  );
}
