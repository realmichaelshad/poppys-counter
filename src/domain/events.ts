import type { Choices } from './pricing';

// Every change in the shop is one of these events, appended to a single log. Nothing else is stored:
// the menu's availability, the kitchen's tickets and the owner's figures are all folded from the log.

export interface OrderLine {
  id: string;
  itemId: string;
  qty: number;
  choices: Choices;
  /** Price of one at the moment the order was placed, in cents. */
  unitCents: number;
}

export interface PlacedOrder {
  id: string;
  name: string;
  /** Real time (ms) of the pickup slot the customer chose. */
  pickupAt: number;
  lines: OrderLine[];
  source: 'customer' | 'rush';
}

interface Base {
  /** Unique across tabs. Replayed rush events have ids derived from their seed, so every tab agrees. */
  id: string;
  /** Real time in ms. */
  at: number;
}

export type ShopEvent =
  | (Base & { type: 'day.opened'; day: string; shopStartMin: number; seed: number })
  | (Base & { type: 'order.placed'; order: PlacedOrder })
  | (Base & { type: 'item.bumped'; orderId: string; lineId: string })
  | (Base & { type: 'order.ready'; orderId: string })
  | (Base & { type: 'order.recalled'; orderId: string })
  | (Base & { type: 'item.soldout'; itemId: string })
  | (Base & { type: 'item.back'; itemId: string })
  | (Base & { type: 'rush.started'; seed: number; plan: 'opening' | 'rush'; startAt: number });

export type EventType = ShopEvent['type'];

/** Events sort by time, then id, so every tab folds the same log in the same order. */
export function compareEvents(a: ShopEvent, b: ShopEvent): number {
  return a.at - b.at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}
