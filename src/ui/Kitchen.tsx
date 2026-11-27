import { signal } from '@preact/signals';
import { useEffect, useRef, useState } from 'preact/hooks';
import { ItemArt } from '../art/Art';
import { allDay, kitchenTickets, type Ticket } from '../domain/derive';
import { CATEGORIES, MENU } from '../domain/menu';
import { formatClock, shopMinute } from '../domain/time';
import { bumpLine, bumpTicket, recall, setSoldOut } from './actions';
import { CloseButton, Sheet } from './Sheet';
import { reducedMotion, shop, stockOpen, store, wide } from './state';

// Tickets that were already on the rail when this page opened do not print again. Anything placed
// after that prints the first time the kitchen is on screen, which is also what makes switching to
// the kitchen after sending an order worth doing.
const seen = new Set<string>();
export function markAllSeen() {
  seen.clear();
  for (const o of store.state.value.orders) seen.add(o.id);
}

export const PRINT_MS = 1700;

/** Where the last Send order press was, so on a wide screen the order can fly from the phone to the printer. */
export const lastSend = { rect: null as DOMRect | null, at: 0 };
const FLY_MS = 520;

function fly(from: DOMRect, to: DOMRect) {
  const slip = document.createElement('div');
  slip.className = 'slip';
  document.body.appendChild(slip);
  const x0 = from.left + from.width / 2 - 34;
  const y0 = from.top + from.height / 2 - 20;
  const x1 = to.left + to.width / 2 - 34;
  const y1 = to.bottom - 70;
  const lift = Math.min(y0, y1) - 90;
  const anim = slip.animate(
    [
      { transform: `translate(${x0}px, ${y0}px) rotate(-6deg) scale(0.9)`, opacity: 0 },
      { transform: `translate(${x0}px, ${y0 - 30}px) rotate(-8deg) scale(1)`, opacity: 1, offset: 0.12 },
      { transform: `translate(${(x0 + x1) / 2}px, ${lift}px) rotate(4deg) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${x1}px, ${y1}px) rotate(0deg) scale(0.7)`, opacity: 0.2 },
    ],
    { duration: FLY_MS, easing: 'cubic-bezier(0.4, 0, 0.3, 1)' },
  );
  anim.onfinish = () => slip.remove();
}

/** The last ticket bumped from this page, for the recall bar. */
export const lastBumped = signal<{ orderId: string; at: number } | null>(null);

function ageText(ms: number): string {
  const min = Math.floor(ms / 60000);
  return min < 1 ? 'Just in' : `${min} min`;
}

function TicketCard({ t, printing, delay, leaving }: { t: Ticket; printing: boolean; delay: number; leaving: boolean }) {
  const s = shop.value;
  const o = t.order;
  const late = t.level === 'late';
  return (
    <article
      class={`ticket level-${t.level}${printing ? ' printing' : ''}${leaving ? ' leaving' : ''}`}
      data-ticket={o.number}
      data-order={o.id}
      style={printing ? { '--print-delay': `${delay}ms` } : undefined}
      aria-label={`Ticket ${o.number} for ${o.name}`}
    >
      {printing && (
        <div class="printer" aria-hidden="true">
          <span class="printer-slot" />
          <span class="printer-led" />
        </div>
      )}
      <div class="paper-clip">
        <div class="paper">
          <header class="t-head">
            <span class="t-num">#{o.number}</span>
            <span class="t-age" data-age={t.level}>
              {late ? `Late, ${ageText(t.ageMs)}` : ageText(t.ageMs)}
            </span>
          </header>
          <p class="t-name">{o.name}</p>
          <p class="t-meta">
            Pickup {s.day ? formatClock(shopMinute(s.day, o.pickupAt)) : ''}
            {o.source === 'customer' && <span class="t-web"> Phone order</span>}
          </p>
          <ul class="t-lines">
            {t.lines.map((l) => (
              <li>
                <button
                  type="button"
                  class={`t-line${l.done ? ' done' : ''}`}
                  aria-pressed={l.done}
                  disabled={l.done || leaving}
                  data-line={l.line.id}
                  onClick={() => {
                    const last = t.lines.filter((x) => !x.done).length === 1;
                    bumpLine(o.id, l.line.id);
                    if (last) lastBumped.value = { orderId: o.id, at: Date.now() };
                  }}
                  aria-label={`${l.done ? 'Done' : 'Bump'} ${l.line.qty} ${l.name}`}
                >
                  <span class="t-qty">{l.line.qty}</span>
                  <span class="t-item">
                    <span class="t-item-name">{l.name}</span>
                    {l.details.map((d) => (
                      <span class="t-mod">{d}</span>
                    ))}
                  </span>
                  <span class="t-box" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {leaving && (
            <span class="t-stamp" aria-hidden="true">
              Ready
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        class="bump"
        data-bump
        disabled={leaving}
        onClick={() => {
          bumpTicket(o.id);
          lastBumped.value = { orderId: o.id, at: Date.now() };
        }}
      >
        Bump ticket
      </button>
    </article>
  );
}

export function KitchenView({ visible }: { visible: boolean }) {
  const s = shop.value;
  const now = store.now.value;
  const tickets = kitchenTickets(s, now);
  const counts = allDay(s);
  const [printing, setPrinting] = useState<Record<string, number>>({});
  const [ghosts, setGhosts] = useState<Ticket[]>([]);
  const prev = useRef<Map<string, Ticket>>(new Map());
  const rail = useRef<HTMLDivElement>(null);
  const ids = tickets.map((t) => t.order.id).join(',');

  // New tickets print, one after another, the moment the kitchen is on screen.
  useEffect(() => {
    if (!visible) return;
    const fresh = tickets.filter((t) => !seen.has(t.order.id));
    if (!fresh.length) return;
    for (const t of fresh) seen.add(t.order.id);
    if (reducedMotion.value) return;
    const animate = fresh.slice(-3);
    const step = 520;
    // An order just sent from the phone beside the kitchen flies over before it prints.
    const sent = lastSend.rect && performance.now() - lastSend.at < 1200 ? lastSend.rect : null;
    const lead = sent && wide.value ? FLY_MS - 120 : 0;
    lastSend.rect = null;
    setPrinting((p) => {
      const next = { ...p };
      animate.forEach((t, i) => (next[t.order.id] = lead + i * step));
      return next;
    });
    const last = animate[animate.length - 1].order.id;
    if (lead && sent) {
      requestAnimationFrame(() => {
        const el = rail.current?.querySelector<HTMLElement>(`[data-order="${last}"]`);
        if (el) fly(sent, el.getBoundingClientRect());
      });
    }
    // Bring the printing ticket into view: inside the rail on a wide screen, on the page on a phone.
    requestAnimationFrame(() => {
      const box = rail.current;
      const el = box?.querySelector<HTMLElement>(`[data-order="${last}"]`);
      if (!box || !el) return;
      const r = el.getBoundingClientRect();
      if (box.scrollHeight > box.clientHeight + 1) {
        const b = box.getBoundingClientRect();
        if (r.bottom > b.bottom - 20 || r.top < b.top) box.scrollTo({ top: box.scrollTop + r.top - b.top - 16, behavior: 'smooth' });
      } else if (r.bottom > window.innerHeight - 20 || r.top < 0) {
        window.scrollTo({ top: window.scrollY + r.top - 90, behavior: 'smooth' });
      }
    });
    const done = window.setTimeout(() => {
      setPrinting((p) => {
        const next = { ...p };
        for (const t of animate) delete next[t.order.id];
        return next;
      });
    }, lead + PRINT_MS + step * animate.length + 100);
    return () => window.clearTimeout(done);
  }, [visible, ids]);

  // A bumped ticket stays a moment with a Ready stamp before it leaves the rail.
  useEffect(() => {
    const current = new Map(tickets.map((t) => [t.order.id, t]));
    const gone: Ticket[] = [];
    for (const [id, t] of prev.current) {
      if (current.has(id)) continue;
      const o = s.orders.find((x) => x.id === id);
      if (o && o.readyAt !== null && visible && !reducedMotion.value)
        gone.push({ ...t, order: o, lines: t.lines.map((l) => ({ ...l, done: true })) });
    }
    prev.current = current;
    if (!gone.length) return;
    setGhosts((g) => [...g, ...gone]);
    const timer = window.setTimeout(() => setGhosts((g) => g.filter((x) => !gone.includes(x))), 900);
    return () => window.clearTimeout(timer);
  }, [ids]);

  const shown = [...tickets, ...ghosts.filter((g) => !tickets.some((t) => t.order.id === g.order.id))].sort(
    (a, b) => a.order.placedAt - b.order.placedAt || a.order.number - b.order.number,
  );
  const soldCount = Object.keys(s.soldOut).length;

  return (
    <div class="kitchen" data-view="kitchen">
      <header class="k-head">
        <h2 class="k-title">Kitchen</h2>
        <span class="k-clock">{s.day ? formatClock(shopMinute(s.day, now)) : ''}</span>
        <button type="button" class="k-stock" data-stock onClick={() => (stockOpen.value = true)}>
          {soldCount ? `Sold out (${soldCount})` : 'Mark sold out'}
        </button>
      </header>
      <section class="allday" aria-label="All day counts">
        <h3 class="allday-title">
          All day <span class="soft">{tickets.length === 1 ? '1 ticket open' : `${tickets.length} tickets open`}</span>
        </h3>
        {counts.length ? (
          <ul class="allday-list">
            {counts.map((c) => (
              <li data-allday={c.itemId}>
                <b key={c.count} class="pop">
                  {c.count}
                </b>
                <span>{c.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="allday-empty">Nothing to make.</p>
        )}
      </section>
      <div class="rail" ref={rail}>
        {shown.length === 0 && (
          <div class="rail-empty">
            <p>No open tickets. New orders print here.</p>
          </div>
        )}
        {shown.map((t) => (
          <TicketCard
            key={t.order.id}
            t={t}
            printing={t.order.id in printing}
            delay={printing[t.order.id] ?? 0}
            leaving={!tickets.includes(t)}
          />
        ))}
      </div>
      <RecallBar />
      {stockOpen.value && <StockSheet />}
    </div>
  );
}

function RecallBar() {
  const lb = lastBumped.value;
  const s = shop.value;
  const now = store.now.value;
  const [, force] = useState(0);
  useEffect(() => {
    if (!lb) return;
    const t = window.setTimeout(() => force((x) => x + 1), 8100);
    return () => window.clearTimeout(t);
  }, [lb]);
  if (!lb || Date.now() - lb.at > 8000) return null;
  const o = s.orders.find((x) => x.id === lb.orderId);
  if (!o || o.readyAt === null || now < 0) return null;
  return (
    <div class="recall" role="status">
      <span>
        Order {o.number} for {o.name} is ready.
      </span>
      <button
        type="button"
        class="recall-btn"
        onClick={() => {
          recall(o.id);
          lastBumped.value = null;
        }}
      >
        Recall
      </button>
    </div>
  );
}

function StockSheet() {
  const s = shop.value;
  const close = () => (stockOpen.value = false);
  return (
    <Sheet label="Sold out" onClose={close} class="stock-sheet">
      <div class="sheet-top">
        <h2 class="sheet-title">Sold out</h2>
        <CloseButton onClick={close} label="Done" />
      </div>
      <p class="hint">Mark an item sold out and it greys out on the menu at once, in every open tab.</p>
      {CATEGORIES.map((c) => (
        <section class="stock-group">
          <h3>{c.label}</h3>
          <ul>
            {MENU.filter((m) => m.category === c.id).map((m) => {
              const out = m.id in s.soldOut;
              return (
                <li class={`stock-row${out ? ' out' : ''}`} data-stock-item={m.id}>
                  <span class={`plate${out ? ' dim' : ''}`} style={{ width: 44, height: 44 }}>
                    <ItemArt art={m.art} size={36} />
                  </span>
                  <span class="stock-name">{m.name}</span>
                  <button type="button" class={out ? 'secondary small' : 'danger small'} onClick={() => setSoldOut(m.id, !out)}>
                    {out ? 'Bring back' : 'Sold out'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </Sheet>
  );
}
