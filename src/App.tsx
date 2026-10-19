import { useEffect, useRef, useState } from 'react';
import { CONFIG } from './config';
import { acknowledge, cashOut, closePartial, initialRun, newRun, openPartial, quote, resolve, secureRandom, spin, successChance, type Run } from './game/engine';
import { Wheel, type SpinRequest } from './ui/Wheel';
import * as audio from './ui/audio';

const money = (c: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
const mult = (m: number) => `${m.toLocaleString('en-US')}×`;
const net = (c: number) => (c >= 0 ? '+' : '−') + money(Math.abs(c));

export function App() {
  const [run, setRun] = useState<Run>(initialRun);
  const runRef = useRef(run);
  const [stake, setStake] = useState(10);
  const [balance, setBalance] = useState(CONFIG.startingBalance * 100);
  const [fraction, setFraction] = useState(0.5);
  const [req, setReq] = useState<SpinRequest | null>(null);
  const [vol, setVol] = useState(0.5);
  const idRef = useRef(0), timer = useRef<number>(0);
  const commit = (r: Run) => { runRef.current = r; setRun(r); };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { audio.sound.volume = vol; audio.sound.muted = vol === 0; }, [vol]);
  useEffect(() => { document.title = CONFIG.title; }, []);

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
  const reset = () => { setReq(null); commit(initialRun()); };

  const spinning = run.phase === 'spinning' || run.phase === 'success';
  const choosing = run.phase === 'choosing', partial = run.phase === 'partial', finished = run.phase === 'cashedOut' || run.phase === 'failed';
  const q = quote(run, fraction), qAll = quote(run, 1);
  const stageNo = run.phase === 'ready' ? 1 : spinning && run.phase === 'spinning' ? run.cleared + 1 : run.cleared + 1;
  const wheelStage = Math.min(run.cleared, CONFIG.ladder.length - 1);
  const pSafe = successChance(finished && run.phase === 'cashedOut' ? wheelStage : wheelStage);
  const stakeC = stake * 100;

  return (
    <main className="app">
      <header>
        <h1>{CONFIG.title}</h1>
        <p className="tag">{CONFIG.tagline}</p>
        <div className="aside">
          <span className="bal">Balance <b>{money(balance)}</b></span>
          <label className="vol">Sound <input type="range" min={0} max={1} step={0.05} value={vol} onChange={(e) => setVol(+e.target.value)} aria-label="Volume" /></label>
        </div>
      </header>

      <section className="stage">
        <Wheel p={pSafe} spin={req} onSettled={settled} onTick={audio.tick} />
        <div className="odds" aria-live="polite">
          {run.phase === 'spinning' ? 'Spinning…' : finished ? '' : `${(pSafe * 100).toFixed(1)}% safe on the next spin`}
        </div>
      </section>

      <section className="stats" aria-label="Run status">
        <div><span>Stage</span><b>{run.phase === 'ready' ? `1 of ${CONFIG.ladder.length}` : `${Math.min(stageNo, CONFIG.ladder.length)} of ${CONFIG.ladder.length}`}</b></div>
        <div><span>Multiplier</span><b>{mult(run.multiplier)}</b></div>
        <div><span>At risk</span><b>{money(run.phase === 'ready' ? stakeC : run.inPlay)}</b></div>
        <div><span>Secured</span><b>{money(run.secured)}</b></div>
      </section>

      {run.phase === 'ready' && (
        <section className="panel start">
          <div className="chips">{CONFIG.stake.presets.map((s) => <button key={s} className={s === stake ? 'on' : ''} onClick={() => setStake(s)}>${s}</button>)}</div>
          <label>Stake <b>${stake}</b>
            <input type="range" min={CONFIG.stake.min} max={CONFIG.stake.max} value={stake} onChange={(e) => setStake(+e.target.value)} />
          </label>
          <button className="primary go" onClick={start} disabled={stakeC > balance}>Spin for {money(stakeC)}</button>
          {stakeC > balance && <button className="link" onClick={() => setBalance(CONFIG.startingBalance * 100)}>Not enough balance. Reset to {money(CONFIG.startingBalance * 100)}</button>}
        </section>
      )}

      {!finished && run.phase !== 'ready' && (
        <section className="decide">
          <button className="big spin" disabled={!choosing} onClick={spinAgain}>
            <span className="t">Spin again</span>
            <span className="s">{choosing ? `Win up to ${money(qAll.nextValue)} (${mult(qAll.nextMultiplier)})` : 'Wheel in motion'}</span>
          </button>
          <button className="big cash" disabled={!choosing} onClick={() => take(1)}>
            <span className="t">Cash out</span>
            <span className="s">{choosing ? `Collect ${money(qAll.total)}` : 'Not available now'}</span>
          </button>
        </section>
      )}

      {choosing && <button className="link part" onClick={() => commit(openPartial(run))}>Cash out part…</button>}
      {partial && (
        <section className="panel partial">
          <div className="chips">{[0.25, 0.5, 0.75].map((f) => <button key={f} className={f === fraction ? 'on' : ''} onClick={() => setFraction(f)}>{f * 100}%</button>)}</div>
          <input type="range" min={5} max={95} step={1} value={Math.round(fraction * 100)} onChange={(e) => setFraction(+e.target.value / 100)} aria-label="Share to secure" />
          <dl>
            <dt>Available now</dt><dd>{money(q.total)}</dd>
            <dt>Secure</dt><dd className="ok">{money(q.secure)}</dd>
            <dt>Keep at risk</dt><dd className="risk">{money(q.remaining)}</dd>
            <dt>If next spin survives</dt><dd>{money(q.remainingIfSurvive)}</dd>
          </dl>
          <div className="row"><button onClick={() => commit(closePartial(run))}>Back</button><button className="primary" onClick={() => take(fraction)}>Secure {money(q.secure)} and continue</button></div>
        </section>
      )}

      {finished && (
        <section className={`panel result ${run.phase}`} role="status">
          <h2>{run.phase === 'failed' ? 'Wiped out' : 'Cashed out'}</h2>
          <p>
            {run.phase === 'failed'
              ? run.secured > 0 ? `The wheel took what was at risk. Your secured ${money(run.secured)} is safe.` : `The wheel took your ${money(run.stake)} stake.`
              : `You secured ${money(run.secured)} from a ${money(run.stake)} stake.`}
          </p>
          <p className="net">Net {net(run.secured - run.stake)}</p>
          <button className="primary" onClick={reset}>New run</button>
        </section>
      )}
      <footer>Prototype with play money. Client-side RNG; not certified and not for real-money use.</footer>
    </main>
  );
}
