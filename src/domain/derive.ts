import type { ShopEvent } from './events';
import { itemById, MENU, type Choice } from './menu';
import { describeChoices, itemsUsed } from './pricing';
import { fold, type Day, type LineState, type OrderState, type ShopState } from './reduce';
import { COOKS, dueRushEvents, type RushRef } from './rush';
import { ceilSlot, CLOSE_MIN, formatClock, OPEN_MIN, realAt, shopMinute, SLOT_MIN } from './time';

// Everything any screen shows is one of these pure functions of the folded state and the time.

/** The whole shop at a moment: the stored log plus every rush event due by then, folded. */
export function shopAt(log: readonly ShopEvent[], now: number): ShopState {
  let day: Day | null = null;
  const rushes: RushRef[] = [];
  for (const e of log) {
    if (e.type === 'day.opened' && (!day || e.at < day.openedAt))
      day = { id: e.day, openedAt: e.at, shopStartMin: e.shopStartMin, seed: e.seed };
    if (e.type === 'rush.started') rushes.push({ id: e.id, seed: e.seed, plan: e.plan, startAt: e.startAt });
  }
  const due = dueRushEvents(rushes, day, now);
  const own = log.filter((e) => e.at <= now || e.type === 'day.opened' || e.type === 'rush.started');
  return fold(due.length ? [...own, ...due] : own);
}

// ---------- Menu ----------

export function choiceAvailable(state: ShopState, choice: Choice): boolean {
  return !choice.itemRef || !(choice.itemRef in state.soldOut);
}

/** Can the item be ordered at all: not sold out, and every required choice has an option left. */
export function itemAvailable(state: ShopState, itemId: string): boolean {
  if (itemId in state.soldOut) return false;
  const item = itemById(itemId);
  return item.groups.every((g) => g.kind !== 'one' || g.choices.some((c) => choiceAvailable(state, c)));
}

export function availability(state: ShopState): Record<string, boolean> {
  return Object.fromEntries(MENU.map((m) => [m.id, itemAvailable(state, m.id)]));
}

/** Menu items a cart line needs that are sold out now. */
export function blockedBy(state: ShopState, itemId: string, choices: Record<string, string[]>): string[] {
  const used = itemsUsed(itemId, choices);
  const blocked = used.filter((id) => id in state.soldOut);
  if (!blocked.length && !itemAvailable(state, itemId)) blocked.push(itemId);
  return blocked;
}

// ---------- Kitchen ----------

export const WARN_MS = 5 * 60000;
export const LATE_MS = 8 * 60000;

export type AgeLevel = 'fresh' | 'waiting' | 'late';

export function ageLevel(ageMs: number): AgeLevel {
  return ageMs >= LATE_MS ? 'late' : ageMs >= WARN_MS ? 'waiting' : 'fresh';
}

export function openOrders(state: ShopState): OrderState[] {
  return state.orders.filter((o) => o.readyAt === null);
}

export interface TicketLine {
  line: LineState;
  name: string;
  details: string[];
  done: boolean;
}

export interface Ticket {
  order: OrderState;
  ageMs: number;
  level: AgeLevel;
  /** One of the cooks is on it: it is among the oldest open tickets, or something on it is bumped. */
  making: boolean;
  lines: TicketLine[];
}

export function kitchenTickets(state: ShopState, now: number): Ticket[] {
  return openOrders(state).map((order, i) => {
    const ageMs = Math.max(0, now - order.placedAt);
    return {
      order,
      ageMs,
      level: ageLevel(ageMs),
      making: i < COOKS || order.lines.some((l) => l.bumpedAt !== null),
      lines: order.lines.map((line) => ({
        line,
        name: itemById(line.itemId).short,
        details: describeChoices(line.itemId, line.choices),
        done: line.bumpedAt !== null,
      })),
    };
  });
}

export interface AllDayCount {
  itemId: string;
  name: string;
  count: number;
}

/** How many of each item are still to make across every open ticket. */
export function allDay(state: ShopState): AllDayCount[] {
  const counts = new Map<string, number>();
  for (const o of openOrders(state))
    for (const l of o.lines) if (l.bumpedAt === null) counts.set(l.itemId, (counts.get(l.itemId) ?? 0) + l.qty);
  const order = new Map(MENU.map((m, i) => [m.id, i]));
  return [...counts]
    .map(([itemId, count]) => ({ itemId, name: itemById(itemId).short, count }))
    .sort((a, b) => b.count - a.count || order.get(a.itemId)! - order.get(b.itemId)!);
}

// ---------- Customer ----------

export type Stage = 'received' | 'making' | 'ready';

export interface OrderStatus {
  order: OrderState;
  stage: Stage;
  /** Open tickets placed before this one. */
  ahead: number;
}

export function orderStatus(state: ShopState, orderId: string): OrderStatus | null {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return null;
  if (order.readyAt !== null) return { order, stage: 'ready', ahead: 0 };
  const open = openOrders(state);
  const ahead = open.findIndex((o) => o.id === orderId);
  const making = ahead < COOKS || order.lines.some((l) => l.bumpedAt !== null);
  return { order, stage: making ? 'making' : 'received', ahead };
}

// ---------- Pickup slots ----------

export const MIN_LEAD_MIN = 5;
export const SLOT_CAPACITY = 4;
export const SLOTS_OFFERED = 8;

export interface Slot {
  at: number;
  min: number;
  label: string;
  /** Orders already promised for this slot and not ready yet. */
  taken: number;
  full: boolean;
}

export interface SlotOffer {
  /** Minutes of cooking waiting on the open tickets, shared between the cooks. */
  queueMin: number;
  /** The earliest pickup minute the kitchen can promise now. */
  earliestMin: number;
  slots: Slot[];
  closed: boolean;
}

/**
 * Pickup times from the kitchen's real load: the work left on every open ticket, shared between
 * the cooks, plus a few minutes to make this order. More open tickets push the first slot later,
 * and a slot that already has four orders promised is full.
 */
export function pickupSlots(state: ShopState, now: number): SlotOffer {
  const day = state.day;
  if (!day) return { queueMin: 0, earliestMin: 0, slots: [], closed: true };
  let queueSec = 0;
  for (const o of openOrders(state))
    for (const l of o.lines) if (l.bumpedAt === null) queueSec += itemById(l.itemId).prepSec * l.qty;
  const queueMin = queueSec / COOKS / 60;
  const nowMin = shopMinute(day, now);
  const earliestMin = nowMin + Math.max(MIN_LEAD_MIN, Math.ceil(queueMin) + 4);
  const first = Math.max(ceilSlot(earliestMin), ceilSlot(OPEN_MIN));
  const promised = new Map<number, number>();
  for (const o of openOrders(state)) {
    const m = Math.round(shopMinute(day, o.pickupAt));
    promised.set(m, (promised.get(m) ?? 0) + 1);
  }
  const slots: Slot[] = [];
  for (let min = first; min <= CLOSE_MIN && slots.length < SLOTS_OFFERED; min += SLOT_MIN) {
    const taken = promised.get(min) ?? 0;
    slots.push({ at: realAt(day, min), min, label: formatClock(min), taken, full: taken >= SLOT_CAPACITY });
  }
  return { queueMin, earliestMin, slots, closed: slots.length === 0 };
}

// ---------- Owner ----------

export interface Quarter {
  startMin: number;
  orders: number;
  cents: number;
}

export interface Seller {
  itemId: string;
  name: string;
  qty: number;
  cents: number;
}

export interface OwnerDay {
  /** Rung up when an order is ready: customers pay at the counter when they collect. */
  salesCents: number;
  /** On open tickets, not rung up yet. */
  pendingCents: number;
  orders: number;
  itemsSold: number;
  avgTicketCents: number;
  /** Mean time from order to ready over the orders that are ready, or null before the first. */
  avgReadyMs: number | null;
  readyCount: number;
  open: number;
  late: number;
  quarters: Quarter[];
  best: Seller[];
  soldOut: { itemId: string; name: string; sinceMin: number }[];
  turnedAway: number;
  nowMin: number;
}

export function ownerDay(state: ShopState, now: number): OwnerDay {
  const day = state.day;
  const nowMin = day ? shopMinute(day, now) : OPEN_MIN;
  let salesCents = 0;
  let pendingCents = 0;
  let itemsSold = 0;
  let readySum = 0;
  let readyCount = 0;
  const firstQ = Math.floor(OPEN_MIN / 15) * 15;
  const lastQ = Math.max(firstQ, Math.floor(nowMin / 15) * 15);
  const quarters: Quarter[] = [];
  for (let m = firstQ; m <= lastQ; m += 15) quarters.push({ startMin: m, orders: 0, cents: 0 });
  const sellers = new Map<string, Seller>();
  for (const o of state.orders) {
    if (o.readyAt !== null) {
      salesCents += o.totalCents;
      readySum += o.readyAt - o.placedAt;
      readyCount++;
    } else pendingCents += o.totalCents;
    if (day) {
      const q = Math.floor((Math.floor(shopMinute(day, o.placedAt)) - firstQ) / 15);
      const bucket = quarters[Math.min(Math.max(q, 0), quarters.length - 1)];
      bucket.orders++;
      bucket.cents += o.totalCents;
    }
    for (const l of o.lines) {
      itemsSold += l.qty;
      const s = sellers.get(l.itemId) ?? { itemId: l.itemId, name: itemById(l.itemId).name, qty: 0, cents: 0 };
      s.qty += l.qty;
      s.cents += l.unitCents * l.qty;
      sellers.set(l.itemId, s);
    }
  }
  const open = openOrders(state);
  return {
    salesCents,
    pendingCents,
    orders: state.orders.length,
    itemsSold,
    avgTicketCents: readyCount ? Math.round(salesCents / readyCount) : 0,
    avgReadyMs: readyCount ? readySum / readyCount : null,
    readyCount,
    open: open.length,
    late: open.filter((o) => now - o.placedAt >= LATE_MS).length,
    quarters,
    best: [...sellers.values()].sort((a, b) => b.qty - a.qty || b.cents - a.cents).slice(0, 5),
    soldOut: Object.entries(state.soldOut)
      .sort((a, b) => a[1] - b[1])
      .map(([itemId, at]) => ({ itemId, name: itemById(itemId).name, sinceMin: day ? shopMinute(day, at) : 0 })),
    turnedAway: state.turnedAway,
    nowMin,
  };
}
