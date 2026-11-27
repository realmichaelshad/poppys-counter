import { compareEvents, type OrderLine, type ShopEvent } from './events';
import { hasItem } from './menu';
import { itemsUsed } from './pricing';

export interface LineState extends OrderLine {
  bumpedAt: number | null;
}

export interface OrderState {
  id: string;
  number: number;
  name: string;
  placedAt: number;
  pickupAt: number;
  source: 'customer' | 'rush';
  lines: LineState[];
  totalCents: number;
  readyAt: number | null;
}

export interface Day {
  id: string;
  openedAt: number;
  shopStartMin: number;
  seed: number;
}

export interface ShopState {
  day: Day | null;
  /** In the order they were placed. */
  orders: OrderState[];
  /** Item id to the time it was marked sold out. */
  soldOut: Record<string, number>;
  rushes: { id: string; seed: number; plan: 'opening' | 'rush'; startAt: number }[];
  /** Rush orders that could not be made because everything on them was sold out. */
  turnedAway: number;
}

export const EMPTY: ShopState = { day: null, orders: [], soldOut: {}, rushes: [], turnedAway: 0 };

function replaceOrder(state: ShopState, index: number, order: OrderState): ShopState {
  const orders = state.orders.slice();
  orders[index] = order;
  return { ...state, orders };
}

/**
 * Applies one event. Pure: returns a new state and never mutates the old one. Every rule is
 * idempotent, so an event that arrives twice (from two tabs, or a replayed rush) changes nothing
 * the second time, and an event about an order that does not exist is ignored.
 */
export function reduce(state: ShopState, e: ShopEvent): ShopState {
  switch (e.type) {
    case 'day.opened': {
      if (state.day) return state;
      return { ...state, day: { id: e.day, openedAt: e.at, shopStartMin: e.shopStartMin, seed: e.seed } };
    }
    case 'order.placed': {
      const o = e.order;
      if (state.orders.some((x) => x.id === o.id)) return state;
      let lines = o.lines.filter((l) => hasItem(l.itemId) && l.qty > 0);
      // A replayed rush order cannot ask for something the kitchen has marked sold out; a real
      // customer's order was checked by the menu when it was sent, so it is taken as written.
      if (o.source === 'rush') {
        lines = lines.filter((l) => itemsUsed(l.itemId, l.choices).every((id) => !(id in state.soldOut)));
        if (lines.length === 0) return { ...state, turnedAway: state.turnedAway + 1 };
      }
      if (lines.length === 0) return state;
      const order: OrderState = {
        id: o.id,
        number: state.orders.length + 1,
        name: o.name,
        placedAt: e.at,
        pickupAt: o.pickupAt,
        source: o.source,
        lines: lines.map((l) => ({ ...l, bumpedAt: null })),
        totalCents: lines.reduce((sum, l) => sum + l.unitCents * l.qty, 0),
        readyAt: null,
      };
      return { ...state, orders: [...state.orders, order] };
    }
    case 'item.bumped': {
      const i = state.orders.findIndex((x) => x.id === e.orderId);
      if (i < 0) return state;
      const order = state.orders[i];
      if (order.readyAt !== null) return state;
      const li = order.lines.findIndex((l) => l.id === e.lineId);
      if (li < 0 || order.lines[li].bumpedAt !== null) return state;
      const lines = order.lines.slice();
      lines[li] = { ...lines[li], bumpedAt: e.at };
      const allDone = lines.every((l) => l.bumpedAt !== null);
      return replaceOrder(state, i, { ...order, lines, readyAt: allDone ? e.at : null });
    }
    case 'order.ready': {
      const i = state.orders.findIndex((x) => x.id === e.orderId);
      if (i < 0 || state.orders[i].readyAt !== null) return state;
      const order = state.orders[i];
      const lines = order.lines.map((l) => (l.bumpedAt === null ? { ...l, bumpedAt: e.at } : l));
      return replaceOrder(state, i, { ...order, lines, readyAt: e.at });
    }
    case 'order.recalled': {
      const i = state.orders.findIndex((x) => x.id === e.orderId);
      if (i < 0 || state.orders[i].readyAt === null) return state;
      const order = state.orders[i];
      const done = order.readyAt;
      // Undo the bump that finished it: lines bumped earlier stay bumped.
      const lines = order.lines.map((l) => (l.bumpedAt === done ? { ...l, bumpedAt: null } : l));
      return replaceOrder(state, i, { ...order, lines, readyAt: null });
    }
    case 'item.soldout': {
      if (e.itemId in state.soldOut || !hasItem(e.itemId)) return state;
      return { ...state, soldOut: { ...state.soldOut, [e.itemId]: e.at } };
    }
    case 'item.back': {
      if (!(e.itemId in state.soldOut)) return state;
      const soldOut = { ...state.soldOut };
      delete soldOut[e.itemId];
      return { ...state, soldOut };
    }
    case 'rush.started': {
      if (state.rushes.some((r) => r.id === e.id)) return state;
      return { ...state, rushes: [...state.rushes, { id: e.id, seed: e.seed, plan: e.plan, startAt: e.startAt }] };
    }
  }
}

/** Folds a log from scratch. Events are sorted and de-duplicated by id first. */
export function fold(events: readonly ShopEvent[], from: ShopState = EMPTY): ShopState {
  const seen = new Set<string>();
  const sorted = events.filter((e) => (seen.has(e.id) ? false : (seen.add(e.id), true))).sort(compareEvents);
  let s = from;
  for (const e of sorted) s = reduce(s, e);
  return s;
}
