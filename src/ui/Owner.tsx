import { useEffect, useRef, useState } from 'preact/hooks';
import { rushPlaying } from '../domain/day';
import { ownerDay, type Quarter } from '../domain/derive';
import { formatCents } from '../domain/pricing';
import { formatClock, formatMinSec } from '../domain/time';
import { playRush, startOver } from './actions';
import { RollingCents, RollingInt } from './Rolling';
import { aboutOpen, shop, store } from './state';

function QuarterChart({ quarters, nowMin }: { quarters: Quarter[]; nowMin: number }) {
  // Drawn at its real pixel width, so labels stay the same size on a phone and a tablet.
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(320);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(200, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = 132;
  const top = 18;
  const base = H - 22;
  const n = Math.max(quarters.length, 8);
  const gap = n > 24 ? 2 : W > 420 ? 6 : 3;
  const bw = (W - gap * (n - 1)) / n;
  const max = Math.max(4, ...quarters.map((q) => q.orders));
  const nice = Math.ceil(max / 4) * 4;
  const currentQ = Math.floor(nowMin / 15) * 15;
  return (
    <div ref={box} class="chart-box">
    <svg class="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Orders by quarter hour. Busiest: ${max} orders.`} data-chart>
      <line x1="0" x2={W} y1={base} y2={base} class="axis" />
      <line x1="0" x2={W} y1={top} y2={top} class="grid" />
      <text x="0" y={top - 6} class="tick">
        {nice} orders
      </text>
      {quarters.map((q, i) => {
        const h = ((base - top) * q.orders) / nice;
        const x = i * (bw + gap);
        const live = q.startMin === currentQ;
        return (
          <g>
            <rect x={x} y={base - h} width={bw} height={Math.max(h, q.orders ? 2 : 0)} rx="2" class={live ? 'bar live' : 'bar'}>
              <title>
                {formatClock(q.startMin)}: {q.orders} orders, {formatCents(q.cents)}
              </title>
            </rect>
            {q.startMin % 60 === 0 && (
              <text x={x} y={H - 6} class="tick">
                {formatClock(q.startMin).replace(':00', '')}
              </text>
            )}
            {live && (
              <text x={x + bw / 2} y={base - h - 5} class="tick now" text-anchor="middle">
                Now
              </text>
            )}
          </g>
        );
      })}
    </svg>
    </div>
  );
}

export function OwnerView() {
  const s = shop.value;
  const now = store.now.value;
  const d = ownerDay(s, now);
  const maxQty = Math.max(1, ...d.best.map((b) => b.qty));
  const playing = rushPlaying(s, now);
  return (
    <div class="owner" data-view="owner">
      <header class="o-head">
        <h2 class="o-title">Today at Poppy's</h2>
        <span class="o-clock">{formatClock(d.nowMin)}</span>
      </header>
      <section class="o-sales" aria-label="Sales today">
        <p class="o-label">Sales today</p>
        <p class="o-big" data-sales={d.salesCents}>
          <RollingCents cents={d.salesCents} ms={1100} name="sales" />
        </p>
        <p class="o-sub">
          Rung up as orders are handed over.{' '}
          {d.pendingCents > 0 && (
            <span>
              <span class="num">{formatCents(d.pendingCents)}</span> more on open tickets.
            </span>
          )}
        </p>
      </section>
      <dl class="o-stats">
        <div>
          <dt>Orders</dt>
          <dd data-orders={d.orders}>
            <RollingInt value={d.orders} name="orders" />
          </dd>
        </div>
        <div>
          <dt>Average order</dt>
          <dd>{d.readyCount ? formatCents(d.avgTicketCents) : 'None yet'}</dd>
        </div>
        <div>
          <dt>Order to ready</dt>
          <dd data-avg-ready>{d.avgReadyMs === null ? 'None yet' : formatMinSec(d.avgReadyMs)}</dd>
        </div>
        <div>
          <dt>Open now</dt>
          <dd>
            {d.open}
            {d.late > 0 && <span class="o-late"> {d.late} late</span>}
          </dd>
        </div>
      </dl>
      <section class="o-block">
        <h3>Orders by quarter hour</h3>
        <QuarterChart quarters={d.quarters} nowMin={d.nowMin} />
      </section>
      <section class="o-block">
        <h3>Most ordered</h3>
        <ol class="best">
          {d.best.map((b) => (
            <li data-best={b.itemId}>
              <span class="best-name">{b.name}</span>
              <span class="best-qty num">{b.qty}</span>
              <span class="best-bar" style={{ width: `${(b.qty / maxQty) * 100}%` }} aria-hidden="true" />
            </li>
          ))}
        </ol>
      </section>
      <section class="o-block">
        <h3>Sold out</h3>
        {d.soldOut.length ? (
          <ul class="o-soldout" data-owner-soldout>
            {d.soldOut.map((x) => (
              <li>
                {x.name} <span class="soft">since {formatClock(x.sinceMin)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="soft">Nothing is sold out.</p>
        )}
        {d.turnedAway > 0 && (
          <p class="soft">
            {d.turnedAway} rush {d.turnedAway === 1 ? 'order' : 'orders'} could not be made because everything on {d.turnedAway === 1 ? 'it' : 'them'} was sold out.
          </p>
        )}
      </section>
      <section class="o-demo">
        <p>
          The morning before you arrived was played from a seeded rush. Every figure here is worked out from the orders in this browser, as they happen.
        </p>
        <div class="o-demo-btns">
          <button type="button" class="secondary" data-rush disabled={playing} onClick={playRush}>
            {playing ? 'Rush on' : 'Send a rush of orders'}
          </button>
          <button type="button" class="secondary" data-reset onClick={startOver}>
            Start the day over
          </button>
        </div>
        <button type="button" class="linkish" onClick={() => (aboutOpen.value = true)}>
          About this demo
        </button>
      </section>
    </div>
  );
}
