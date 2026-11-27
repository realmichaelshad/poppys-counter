import { useEffect, useRef, useState } from 'preact/hooks';
import { ItemArt, Mark } from '../art/Art';
import shopPicture from '../art/shop.webp';
import { cartCount, cartTotal, cleanName, NAME_MAX, QTY_MAX, type Problem } from '../domain/cart';
import {
  availability,
  blockedBy,
  choiceAvailable,
  kitchenTickets,
  orderStatus,
  pickupSlots,
  type Stage,
} from '../domain/derive';
import { CATEGORIES, itemById, MENU, type MenuItem, type OptionGroup } from '../domain/menu';
import { defaultChoices, describeChoices, formatCents, unitCents, type Choices } from '../domain/pricing';
import { formatClock, shopMinute } from '../domain/time';
import { addToCart, changeQty, ensureSlot, orderProblems, removeLines, sendOrder } from './actions';
import { lastSend } from './Kitchen';
import { RollingCents } from './Rolling';
import { CloseButton, Sheet } from './Sheet';
import { cart, menuSheet, myOrders, orderName, pickupAt, shop, store, view, wide } from './state';

function Plate({ item, size, dim }: { item: MenuItem; size: number; dim?: boolean }) {
  return (
    <span class={`plate${dim ? ' dim' : ''}`} style={{ width: size, height: size }}>
      <ItemArt art={item.art} size={Math.round(size * 0.84)} />
    </span>
  );
}

function openItem(item: MenuItem) {
  menuSheet.value = { kind: 'item', itemId: item.id, choices: defaultChoices(item), qty: 1 };
}

export function MenuView({ framed }: { framed: boolean }) {
  const s = shop.value;
  const now = store.now.value;
  const avail = availability(s);
  const offer = pickupSlots(s, now);
  const open = kitchenTickets(s, now).length;
  const scroller = useRef<HTMLDivElement>(null);

  const jump = (id: string) => {
    const el = document.getElementById(`cat-${id}`);
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div class={`menu${framed ? ' framed' : ''}`} data-view="menu" ref={scroller}>
      {framed && (
        <div class="appbar">
          <Mark size={30} />
          <span class="appbar-name">Poppy's Counter</span>
        </div>
      )}
      <ActiveOrder />
      <section class="menu-intro">
        <img
          class="shop-picture"
          src={shopPicture}
          width={1200}
          height={800}
          alt="The counter at Poppy's: baskets of bagels on two shelves, a case of schmears, paper cups and a coffee urn under a striped awning."
          decoding="async"
        />
        <h1>Order ahead. We call your name at the counter.</h1>
        <p class="soonest" data-soonest>
          {offer.closed ? (
            'The kitchen is closed for today.'
          ) : (
            <>
              Soonest pickup <b>{offer.slots.find((x) => !x.full)?.label}</b>.{' '}
              <span class="soft">
                {open === 0 ? 'The kitchen is quiet.' : `${open} ${open === 1 ? 'order' : 'orders'} on the line.`}
              </span>
            </>
          )}
        </p>
      </section>
      <nav class="cats" aria-label="Menu sections">
        {CATEGORIES.map((c) => (
          <button type="button" class="cat" onClick={() => jump(c.id)}>
            {c.label}
          </button>
        ))}
      </nav>
      {CATEGORIES.map((c) => (
        <section class="menu-section" id={`cat-${c.id}`} aria-labelledby={`h-${c.id}`}>
          <h2 id={`h-${c.id}`}>{c.label}</h2>
          <ul class="rows">
            {MENU.filter((m) => m.category === c.id).map((m) => {
              const ok = avail[m.id];
              return (
                <li class={`row${ok ? '' : ' out'}`} data-item={m.id} data-available={ok ? 'yes' : 'no'}>
                  <button type="button" class="row-hit" disabled={!ok} onClick={() => openItem(m)} aria-label={`${m.name}, ${ok ? formatCents(m.cents) : 'sold out today'}`}>
                    <Plate item={m} size={68} dim={!ok} />
                    <span class="row-text">
                      <span class="row-name">{m.name}</span>
                      <span class="row-blurb">{m.blurb}</span>
                      {ok ? <span class="row-price">{formatCents(m.cents)}</span> : <span class="row-out">Sold out today</span>}
                    </span>
                    {ok && <span class="row-add" aria-hidden="true">Add</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <footer class="menu-foot">
        <p>Open 6:30 am to 2 pm. Pay at the counter when you pick up.</p>
        <p>
          Concept project. Poppy's Counter is a fictional shop. Nothing is charged or sent.{' '}
          <a href="https://michaelshadpour.com" target="_blank" rel="noopener">
            Design and build: Michael Shadpour
          </a>
        </p>
      </footer>
      <CartBar />
      <ItemSheet />
      <CartSheet />
      <SentSheet />
    </div>
  );
}

function CartBar() {
  const lines = cart.value;
  if (!lines.length || menuSheet.value) return null;
  return (
    <div class="cartbar">
      <button type="button" class="cartbar-btn" data-cart onClick={() => (menuSheet.value = { kind: 'cart' })}>
        <span class="cartbar-count">
          {cartCount(lines)} {cartCount(lines) === 1 ? 'item' : 'items'}
        </span>
        <span class="cartbar-label">Review order</span>
        <span class="cartbar-total">
          <RollingCents cents={cartTotal(lines)} />
        </span>
      </button>
    </div>
  );
}

// ---------- Item ----------

function ChoiceGroup({
  group,
  choices,
  onChange,
}: {
  group: OptionGroup;
  choices: Choices;
  onChange: (c: Choices) => void;
}) {
  const s = shop.value;
  const sel = choices[group.id] ?? [];
  if (group.kind === 'toggle') {
    const c = group.choices[0];
    const on = sel.includes(c.id);
    return (
      <div class="group">
        <button
          type="button"
          class={`toggle${on ? ' on' : ''}`}
          role="switch"
          aria-checked={on}
          data-choice={`${group.id}:${c.id}`}
          onClick={() => onChange({ ...choices, [group.id]: on ? [] : [c.id] })}
        >
          <span class="toggle-label">
            {c.label}
            {c.cents > 0 && <span class="plus">+{formatCents(c.cents)}</span>}
          </span>
          <span class="switch" aria-hidden="true">
            <span class="knob" />
          </span>
        </button>
      </div>
    );
  }
  return (
    <fieldset class="group">
      <legend>{group.label}</legend>
      <div class={`choices kind-${group.kind}`}>
        {group.choices.map((c) => {
          const on = sel.includes(c.id);
          const ok = choiceAvailable(s, c);
          const pick = () => {
            if (group.kind === 'one') onChange({ ...choices, [group.id]: [c.id] });
            else onChange({ ...choices, [group.id]: on ? sel.filter((x) => x !== c.id) : [...sel, c.id] });
          };
          return (
            <button
              type="button"
              class={`choice${on ? ' on' : ''}${ok ? '' : ' out'}`}
              aria-pressed={on}
              disabled={!ok && !on}
              data-choice={`${group.id}:${c.id}`}
              onClick={pick}
            >
              <span class="choice-label">{c.label}</span>
              {!ok ? <span class="plus">Sold out</span> : c.cents > 0 && <span class="plus">+{formatCents(c.cents)}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ItemSheet() {
  const sh = menuSheet.value;
  if (!sh || sh.kind !== 'item') return null;
  const item = itemById(sh.itemId);
  const s = shop.value;
  const blocked = blockedBy(s, item.id, sh.choices);
  const each = unitCents(item.id, sh.choices);
  const close = () => (menuSheet.value = null);
  const set = (patch: Partial<typeof sh>) => (menuSheet.value = { ...sh, ...patch });
  const add = () => {
    if (blocked.length) return;
    addToCart(item.id, sh.choices, sh.qty);
    close();
  };
  return (
    <Sheet
      label={item.name}
      onClose={close}
      class="item-sheet"
      footer={
        <div class="item-foot">
          <div class="stepper" role="group" aria-label="How many">
            <button type="button" aria-label="One fewer" disabled={sh.qty <= 1} onClick={() => set({ qty: sh.qty - 1 })}>
              <Minus />
            </button>
            <span class="qty" aria-live="polite">
              {sh.qty}
            </span>
            <button type="button" aria-label="One more" disabled={sh.qty >= QTY_MAX} onClick={() => set({ qty: sh.qty + 1 })}>
              <Plus />
            </button>
          </div>
          <button type="button" class="primary add" data-add disabled={blocked.length > 0} onClick={add}>
            <span>{blocked.length ? 'Sold out' : 'Add to order'}</span>
            <RollingCents cents={each * sh.qty} ms={260} />
          </button>
        </div>
      }
    >
      <div class="sheet-top">
        <CloseButton onClick={close} />
      </div>
      <div class="item-hero">
        <Plate item={item} size={124} dim={blocked.includes(item.id)} />
        <div>
          <h2 class="item-name">{item.name}</h2>
          <p class="item-blurb">{item.blurb}</p>
          {blocked.length > 0 && (
            <p class="warn" role="status">
              {blocked.includes(item.id)
                ? 'The kitchen just marked this sold out.'
                : `${blocked.map((id) => itemById(id).name).join(' and ')} just sold out. Pick another.`}
            </p>
          )}
        </div>
      </div>
      {item.groups.map((g) => (
        <ChoiceGroup group={g} choices={sh.choices} onChange={(choices) => set({ choices })} />
      ))}
    </Sheet>
  );
}

function Minus() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M4 10 H16" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
    </svg>
  );
}

function Plus() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
      <path d="M4 10 H16 M10 4 V16" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
    </svg>
  );
}

// ---------- Cart ----------

function problemText(p: Problem): string | null {
  switch (p.kind) {
    case 'empty':
      return null;
    case 'soldout':
      return 'Something in your order just sold out. Remove it to send.';
    case 'name':
      return 'Add a name so the counter can call it out.';
    case 'slot':
      return p.next ? 'That pickup time has passed. Pick another.' : 'Every pickup time is full. Try again in a few minutes.';
    case 'closed':
      return 'The kitchen is closed for today.';
  }
}

function CartSheet() {
  const sh = menuSheet.value;
  const [tried, setTried] = useState(false);
  const [moved, setMoved] = useState<string | null>(null);
  const s = shop.value;
  const now = store.now.value;
  const isOpen = !!sh && sh.kind === 'cart';

  // The clock can pass the chosen slot while the sheet is open; move to the next one and say so.
  useEffect(() => {
    if (!isOpen) return;
    const before = pickupAt.value;
    const after = ensureSlot();
    if (before !== null && after !== before && s.day) {
      setMoved(after ? `${formatClock(shopMinute(s.day, before))} has passed. Moved to ${formatClock(shopMinute(s.day, after))}.` : null);
    }
  }, [isOpen, Math.floor(now / 5000), s]);

  if (!isOpen) return null;
  const lines = cart.value;
  const offer = pickupSlots(s, now);
  const problems = orderProblems();
  const close = () => (menuSheet.value = null);
  const shown = problems.filter((p) => p.kind === 'soldout' || p.kind === 'closed' || tried).map(problemText).filter(Boolean);
  const send = (e: MouseEvent) => {
    lastSend.rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    lastSend.at = performance.now();
    setTried(true);
    const r = sendOrder();
    if (typeof r === 'string') setTried(false);
  };
  const soldKeys = problems.find((p) => p.kind === 'soldout')?.keys ?? [];
  const day = s.day;
  const ahead = kitchenTickets(s, now).length;

  return (
    <Sheet
      label="Your order"
      onClose={close}
      class="cart-sheet"
      footer={
        lines.length > 0 && (
          <div class="send-foot">
            {shown.length > 0 && (
              <p class="warn" role="alert">
                {shown[0]}
              </p>
            )}
            <button type="button" class={`primary send${problems.length ? ' blocked' : ''}`} data-send onClick={send}>
              <span>Send order</span>
              <span class="num">{formatCents(cartTotal(lines))}</span>
            </button>
            <p class="demo-note">Demo. Nothing is charged or sent.</p>
          </div>
        )
      }
    >
      <div class="sheet-top">
        <h2 class="sheet-title">Your order</h2>
        <CloseButton onClick={close} label="Keep ordering" />
      </div>
      {lines.length === 0 ? (
        <div class="empty">
          <p>Your order is empty. Pick something from the menu and it shows up here.</p>
          <button type="button" class="secondary" onClick={close}>
            Back to the menu
          </button>
        </div>
      ) : (
        <>
          <ul class="cart-lines">
            {lines.map((l) => {
              const item = itemById(l.itemId);
              const sold = soldKeys.includes(l.key);
              const words = describeChoices(l.itemId, l.choices);
              return (
                <li class={`cart-line${sold ? ' out' : ''}`} data-line={l.itemId}>
                  <Plate item={item} size={52} dim={sold} />
                  <div class="cart-text">
                    <span class="cart-name">{item.name}</span>
                    {words.length > 0 && <span class="cart-words">{words.join(', ')}</span>}
                    {sold ? (
                      <span class="cart-out">Sold out just now</span>
                    ) : (
                      <span class="cart-each">{formatCents(unitCents(l.itemId, l.choices) * l.qty)}</span>
                    )}
                  </div>
                  {sold ? (
                    <button type="button" class="secondary small" onClick={() => removeLines([l.key])}>
                      Remove
                    </button>
                  ) : (
                    <div class="stepper small" role="group" aria-label={`How many ${item.name}`}>
                      <button type="button" aria-label={l.qty === 1 ? `Remove ${item.name}` : 'One fewer'} onClick={() => changeQty(l.key, l.qty - 1)}>
                        <Minus />
                      </button>
                      <span class="qty">{l.qty}</span>
                      <button type="button" aria-label="One more" disabled={l.qty >= QTY_MAX} onClick={() => changeQty(l.key, l.qty + 1)}>
                        <Plus />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <fieldset class="group">
            <legend>Pickup time</legend>
            <p class="hint">
              {ahead === 0
                ? 'The kitchen is quiet, so the soonest time is a few minutes away.'
                : `The kitchen has ${ahead} ${ahead === 1 ? 'order' : 'orders'} open, so the soonest time is set by that.`}
            </p>
            <div class="slots" data-slots>
              {offer.slots.map((slot) => (
                <button
                  type="button"
                  class={`slot${pickupAt.value === slot.at ? ' on' : ''}`}
                  aria-pressed={pickupAt.value === slot.at}
                  disabled={slot.full}
                  onClick={() => {
                    pickupAt.value = slot.at;
                    setMoved(null);
                  }}
                >
                  <span>{slot.label.replace(/ [ap]m$/, '')}</span>
                  <span class="slot-sub">{slot.full ? 'Full' : slot.label.slice(-2)}</span>
                </button>
              ))}
            </div>
            {moved && day && (
              <p class="note" role="status">
                {moved}
              </p>
            )}
          </fieldset>
          <label class="group name-field">
            <span class="legend">Name for the order</span>
            <input
              type="text"
              data-name
              value={orderName.value}
              maxLength={NAME_MAX}
              autoComplete="given-name"
              enterKeyHint="done"
              placeholder="What should we call out?"
              onInput={(e) => (orderName.value = (e.target as HTMLInputElement).value)}
              onBlur={() => (orderName.value = cleanName(orderName.value))}
            />
          </label>
          <p class="total-row">
            <span>Total</span>
            <span class="num">{formatCents(cartTotal(lines))}</span>
          </p>
          <p class="hint">Pay at the counter when you pick up.</p>
        </>
      )}
    </Sheet>
  );
}

// ---------- After sending ----------

const STAGES: { id: Stage; label: string }[] = [
  { id: 'received', label: 'Received' },
  { id: 'making', label: 'Being made' },
  { id: 'ready', label: 'Ready' },
];

export function StageTrack({ stage }: { stage: Stage }) {
  const at = STAGES.findIndex((x) => x.id === stage);
  return (
    <ol class="stages" data-stage={stage}>
      {STAGES.map((x, i) => (
        <li class={i < at ? 'past' : i === at ? 'now' : ''} aria-current={i === at ? 'step' : undefined}>
          <span class="dot" aria-hidden="true" />
          <span>{x.label}</span>
        </li>
      ))}
    </ol>
  );
}

function stageLine(stage: Stage, ahead: number): string {
  if (stage === 'ready') return 'Ready at the counter. Say your name.';
  if (stage === 'making') return 'A cook has your ticket.';
  return ahead === 1 ? 'One order ahead of yours.' : `${ahead} orders ahead of yours.`;
}

function SentSheet() {
  const sh = menuSheet.value;
  if (!sh || sh.kind !== 'sent') return null;
  const s = shop.value;
  const st = orderStatus(s, sh.orderId);
  const close = () => (menuSheet.value = null);
  if (!st || !s.day) return null;
  const { order } = st;
  return (
    <Sheet label="Order sent" onClose={close} class="sent-sheet">
      <div class="sheet-top">
        <h2 class="sheet-title">{st.stage === 'ready' ? 'Your order is ready' : 'Sent to the kitchen'}</h2>
        <CloseButton onClick={close} label="Done" />
      </div>
      <p class="sent-big" data-sent-number={order.number}>
        Order {order.number} for <span class="sent-name">{order.name}</span>
      </p>
      <StageTrack stage={st.stage} />
      <p class="sent-line" data-sent-line>
        {stageLine(st.stage, st.ahead)}
      </p>
      <p class="hint">
        Pickup at {formatClock(shopMinute(s.day, order.pickupAt))}. {formatCents(order.totalCents)}, paid at the counter.
      </p>
      {!wide.value && (
        <button
          type="button"
          class="primary go-kitchen"
          data-go-kitchen
          onClick={() => {
            close();
            view.value = 'kitchen';
          }}
        >
          See it print in the kitchen
        </button>
      )}
      <p class="demo-note">Demo. Nothing is charged or sent.</p>
    </Sheet>
  );
}

function ActiveOrder() {
  const s = shop.value;
  const now = store.now.value;
  const id = myOrders.value.at(-1);
  if (!id || !s.day) return null;
  const st = orderStatus(s, id);
  if (!st) return null;
  // A ready order stays up for ten minutes, then the strip goes away.
  if (st.stage === 'ready' && now - (st.order.readyAt ?? now) > 10 * 60000) return null;
  return (
    <button type="button" class={`active-order stage-${st.stage}`} data-active-order onClick={() => (menuSheet.value = { kind: 'sent', orderId: id })}>
      <span class="ao-num">Order {st.order.number}</span>
      <span class="ao-state">{STAGES.find((x) => x.id === st.stage)!.label}</span>
      <span class="ao-link">Track</span>
    </button>
  );
}
