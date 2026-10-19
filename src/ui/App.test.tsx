import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../App';
import { acknowledge, cashOut, newRun, openPartial, resolve, spin, type Run } from '../game/engine';

const html = (r?: Run) => renderToStaticMarkup(<App initial={r} />);
const btn = (h: string, cls: string) => h.match(new RegExp(`<button[^>]*class="${cls}"[^>]*>`))![0];
const step = (r: Run, v: number) => acknowledge(resolve(spin(r, () => v).run));

describe('UI states', () => {
  it('betting: stake selector, Place Bet, Round 1, no tagline/stage/volume slider', () => {
    const h = html();
    expect(h).toContain('Place Bet'); expect(h).toContain('Round</span><b>1'); expect(h).toContain('Stake');
    expect(h).not.toContain('Spin. Survive'); expect(h).not.toContain('Stage'); expect(h).not.toContain('New Run'); expect(h).not.toContain('Volume');
    expect(h).toContain('aria-label="How to play"'); expect(h).toMatch(/aria-label="Turn sound (on|off)"/);
  });
  it('spinning: both actions disabled', () => {
    const h = html(spin(newRun(1000), () => 0).run);
    expect(btn(h, 'big spin')).toContain('disabled'); expect(btn(h, 'big cash')).toContain('disabled'); expect(h).toContain('Spinning');
  });
  it('choosing: both enabled with next payout and cash-out amount; secured hidden until used', () => {
    const r = step(newRun(1000), 0), h = html(r);
    expect(btn(h, 'big spin')).not.toContain('disabled'); expect(btn(h, 'big cash')).not.toContain('disabled');
    expect(h).toContain('Spin Again'); expect(h).toContain('Cash Out'); expect(h).toContain('Cash out part'); expect(h).not.toContain('Secured');
    expect(h).toContain('$10.67'); expect(h).toContain('Round</span><b>2');
  });
  it('partial sheet shows secure / keep amounts; Secured appears afterwards', () => {
    const r = step(newRun(1000), 0);
    expect(html(openPartial(r))).toContain('Secure $5.34');
    expect(html(cashOut(r, 0.5))).toContain('Secured');
  });
  it('results offer Play Again (never New Run)', () => {
    const lost = html(resolve(spin(newRun(1000), () => 0.9999).run)), won = html(cashOut(step(newRun(1000), 0), 1));
    for (const h of [lost, won]) { expect(h).toContain('Play Again'); expect(h).not.toContain('New Run'); }
    expect(lost).toContain('You lost'); expect(won).toContain('You cashed out'); expect(won).toContain('Net +$0.67');
  });
});
