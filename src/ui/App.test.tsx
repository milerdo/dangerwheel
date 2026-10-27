import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from '../App';
import { acknowledge, cashOut, newRun, openPartial, resolve, spin, type Run } from '../game/engine';

const html = (r?: Run) => renderToStaticMarkup(<App initial={r} />);
const btn = (h: string, cls: string) => h.match(new RegExp(`<button[^>]*class="${cls}"[^>]*>`))![0];
const step = (r: Run, v: number) => acknowledge(resolve(spin(r, () => v).run));

describe('UI states', () => {
  it('betting: logo, stake selector, Place Bet, no stats row/tagline', () => {
    const h = html();
    expect(h).toContain('class="logo"'); expect(h).toContain('Place Bet'); expect(h).toContain('Stake');
    for (const t of ['Spin. Survive', 'Game status', 'Round', 'Multiplier', 'Safe chance', 'New Run']) expect(h).not.toContain(t);
    expect(h).toContain('>Help</button>'); expect(h).toMatch(/aria-label="Turn sound (on|off)"/);
  });
  it('spinning: both actions disabled', () => {
    const h = html(spin(newRun(1000), () => 0).run);
    expect(btn(h, 'big spin')).toContain('disabled'); expect(btn(h, 'big cash')).toContain('disabled'); expect(h).toContain('Spinning');
  });
  it('choosing: both enabled, amounts on the buttons, no separate cash-out-part link', () => {
    const h = html(step(newRun(1000), 0));
    expect(btn(h, 'big spin')).not.toContain('disabled'); expect(btn(h, 'big cash')).not.toContain('disabled');
    expect(h).toContain('Spin Again'); expect(h).toContain('Cash Out'); expect(h).toContain('$10.67'); expect(h).toContain('$12.26');
    expect(h).not.toContain('Cash out part');
  });
  it('cash-out sheet offers cash out all plus a partial amount', () => {
    const h = html(openPartial(step(newRun(1000), 0)));
    expect(h).toContain('role="dialog"'); expect(h).toContain('Cash out all'); expect(h).toContain('Secure $5.34');
  });
  it('results: LOST / CASHED OUT / WON with the amount and Play Again', () => {
    const lost = html(resolve(spin(newRun(1000), () => 0.9999).run)), won = html(cashOut(step(newRun(1000), 0), 1));
    let top = newRun(1000); for (let i = 0; i < 18; i++) top = step(top, 0);
    for (const h of [lost, won, html(top)]) { expect(h).toContain('Play Again'); expect(h).not.toContain('New Run'); }
    expect(lost).toContain('GAME OVER'); expect(lost).toContain('$0.00'); expect(lost).toContain('collected');
    expect(won).toContain('CASHED OUT'); expect(won).toContain('$10.67');
    expect(html(top)).toContain('WON'); expect(html(top)).toContain('$25,000.00');
  });
});
