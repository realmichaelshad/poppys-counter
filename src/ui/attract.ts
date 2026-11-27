import { newDay } from '../domain/day';
import { ownerDay, shopAt } from '../domain/derive';
import { primeRolling } from './Rolling';
import type { ShopEvent } from '../domain/events';
import { fold } from '../domain/reduce';
import { dueRushEvents } from '../domain/rush';
import { ensureSlot } from './actions';
import { lastBumped, markAllSeen } from './Kitchen';
import { attracting, cart, fingerAt, menuSheet, myOrders, orderName, pickupAt, stockOpen, store, view, wide } from './state';

// Attract mode: the app uses itself. Every step goes through the real buttons (element.click()), so
// the recording shows the real app. Each loop starts from the same morning at the same shop time,
// so every loop looks the same at its start and a recording loops cleanly.

const ANCHOR = Date.UTC(2026, 10, 21, 15, 0, 0);

interface Script {
  first: { item: string; taps: string[] };
  second: { item: string; taps: string[] };
  name: string;
}

const SCRIPTS: Script[] = [
  {
    first: { item: 'everything', taps: ['toasted:yes', 'schmear:scallion'] },
    second: { item: 'latte', taps: ['milk:oat'] },
    name: 'Dana',
  },
  {
    first: { item: 'egg-cheese', taps: ['extras:bacon'] },
    second: { item: 'drip', taps: ['size:large'] },
    name: 'Luis',
  },
];

/** The morning so far, frozen: every event up to the anchor, written out, with nothing left to replay. */
function baseLog(): ShopEvent[] {
  const day = newDay(ANCHOR, 20261121);
  const s = fold(day);
  const due = dueRushEvents(s.rushes, s.day, ANCHOR);
  const log: ShopEvent[] = [day[0], ...due];
  // Leave one ticket on the rail, so the new one prints beside it in plain view.
  const open = fold(log).orders.filter((o) => o.readyAt === null);
  open.slice(0, -1).forEach((o, i) => log.push({ type: 'order.ready', id: `attract-ready-${i}`, orderId: o.id, at: ANCHOR - 4000 + i }));
  return log;
}

let token = 0;
let clockTimer = 0;
let loopStart = 0;

class Cancelled extends Error {}

function wait(ms: number, my: number): Promise<void> {
  return new Promise((ok, fail) =>
    window.setTimeout(() => (my === token && attracting.value ? ok() : fail(new Cancelled())), ms),
  );
}

function q(sel: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(sel);
  if (!el) throw new Cancelled();
  return el;
}

let taps = 0;
async function tap(sel: string, my: number, after = 380) {
  const el = q(sel);
  const r = el.getBoundingClientRect();
  fingerAt.value = { x: r.left + r.width / 2, y: r.top + r.height / 2, n: ++taps };
  await wait(140, my);
  el.click();
  await wait(after, my);
}

async function reveal(sel: string, my: number) {
  const el = q(sel);
  const r = el.getBoundingClientRect();
  const box = (el.closest('.phone-screen') as HTMLElement | null)?.getBoundingClientRect() ?? {
    top: 0,
    bottom: window.innerHeight,
  };
  if (r.top < box.top + 60 || r.bottom > box.bottom - 90) {
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    await wait(460, my);
  }
}

function resetScreens() {
  lastBumped.value = null;
  cart.value = [];
  orderName.value = '';
  pickupAt.value = null;
  menuSheet.value = null;
  stockOpen.value = false;
  myOrders.value = [];
  view.value = 'menu';
  document.querySelector('.phone-screen .menu')?.scrollTo(0, 0);
  window.scrollTo(0, 0);
}

async function loop(my: number, base: ShopEvent[]) {
  let n = 0;
  while (my === token) {
    try {
      await once(my, base, ++n);
    } catch (e) {
      if (!(e instanceof Cancelled)) console.error(e);
      if (my !== token || !attracting.value) return;
    }
  }
}

async function once(my: number, base: ShopEvent[], n: number) {
  {
    const script = SCRIPTS[(n - 1) % SCRIPTS.length];
    const day = ownerDay(fold(base), ANCHOR);
    primeRolling('sales', day.salesCents, true);
    primeRolling('orders', day.orders, true);
    store.replace(base);
    store.setNow(ANCHOR);
    markAllSeen();
    resetScreens();
    loopStart = performance.now();
    // Mark the loop once the reset has painted, so a recording starts on the clean first frame.
    await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
    document.documentElement.dataset.attractLoop = String(n);
    document.documentElement.dataset.attractStart = String(Date.now());
    await wait(650, my);

    // First item, with its choices.
    await reveal(`[data-item="${script.first.item}"]`, my);
    await tap(`[data-item="${script.first.item}"] .row-hit`, my, 440);
    for (const c of script.first.taps) await tap(`[data-choice="${c}"]`, my, 300);
    await tap('[data-add]', my, 360);

    // Second item.
    await reveal(`[data-item="${script.second.item}"]`, my);
    await tap(`[data-item="${script.second.item}"] .row-hit`, my, 400);
    for (const c of script.second.taps) await tap(`[data-choice="${c}"]`, my, 260);
    await tap('[data-add]', my, 320);

    // Review, name, send.
    await tap('[data-cart]', my, 380);
    ensureSlot();
    for (let i = 1; i <= script.name.length; i++) {
      orderName.value = script.name.slice(0, i);
      await wait(55, my);
    }
    await wait(200, my);
    await tap('[data-send]', my, 200);
    const sent = myOrders.value.at(-1);
    if (!sent) throw new Cancelled();

    if (!wide.value) {
      await wait(500, my);
      await tap('[data-go-kitchen]', my, 0);
    }
    // The ticket prints.
    await wait(1950, my);
    await tap(`[data-order="${sent}"] [data-line="l0"]`, my, 360);
    await tap(`[data-order="${sent}"] [data-bump]`, my, 850);
    if (!wide.value) {
      view.value = 'owner';
      await wait(1250, my);
    } else {
      // Let the sales figure finish rolling, then put the phone back for the next customer.
      menuSheet.value = null;
      lastBumped.value = null;
      document.querySelector('.phone-screen .menu')?.scrollTo({ top: 0, behavior: 'smooth' });
      await wait(900, my);
    }
    fingerAt.value = null;
  }
}

function tickClock() {
  store.setNow(ANCHOR + (performance.now() - loopStart));
}

function stop() {
  if (!attracting.value) return;
  token++;
  attracting.value = false;
  window.clearInterval(clockTimer);
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.removeEventListener(ev, stop, true);
  fingerAt.value = null;
  resetScreens();
  store.goLive();
  markAllSeen();
  delete document.documentElement.dataset.attractLoop;
}

export function startAttract() {
  const base = baseLog();
  // Make sure the frozen morning really has nothing left to replay.
  if (shopAt(base, ANCHOR + 3600000).orders.length !== fold(base).orders.length) console.warn('attract base is not frozen');
  store.replace(base);
  store.setNow(ANCHOR);
  loopStart = performance.now();
  clockTimer = window.setInterval(tickClock, 250);
  for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) window.addEventListener(ev, stop, true);
  const my = ++token;
  // Give the fonts a moment so the first frame is the finished page.
  document.fonts.ready.then(() =>
    loop(my, base).catch((e) => {
      if (!(e instanceof Cancelled)) console.error(e);
    }),
  );
}
