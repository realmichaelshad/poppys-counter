import type { PlacedOrder } from './events';
import { itemById } from './menu';
import { normalizeChoices, unitCents, type Choices } from './pricing';
import type { ShopState } from './reduce';
import { blockedBy, pickupSlots } from './derive';

export interface CartLine {
  key: string;
  itemId: string;
  qty: number;
  choices: Choices;
}

export const NAME_MAX = 40;
export const QTY_MAX = 12;

export function lineKey(itemId: string, choices: Choices): string {
  const norm = normalizeChoices(itemById(itemId), choices);
  return `${itemId}|${Object.keys(norm)
    .sort()
    .map((k) => `${k}=${norm[k].join('+')}`)
    .join(';')}`;
}

/** Adds a line, or adds to the quantity of an identical one. */
export function addLine(cart: readonly CartLine[], itemId: string, choices: Choices, qty: number): CartLine[] {
  const norm = normalizeChoices(itemById(itemId), choices);
  const key = lineKey(itemId, norm);
  const i = cart.findIndex((l) => l.key === key);
  if (i >= 0) {
    const next = cart.slice();
    next[i] = { ...next[i], qty: Math.min(QTY_MAX, next[i].qty + qty) };
    return next;
  }
  return [...cart, { key, itemId, qty: Math.min(QTY_MAX, Math.max(1, qty)), choices: norm }];
}

export function setQty(cart: readonly CartLine[], key: string, qty: number): CartLine[] {
  if (qty <= 0) return cart.filter((l) => l.key !== key);
  return cart.map((l) => (l.key === key ? { ...l, qty: Math.min(QTY_MAX, qty) } : l));
}

export function cartCount(cart: readonly CartLine[]): number {
  return cart.reduce((s, l) => s + l.qty, 0);
}

export function cartTotal(cart: readonly CartLine[]): number {
  return cart.reduce((s, l) => s + unitCents(l.itemId, l.choices) * l.qty, 0);
}

/** Trims and collapses spaces; the order name is what the counter calls out. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

export type Problem =
  | { kind: 'empty' }
  | { kind: 'soldout'; keys: string[] }
  | { kind: 'name' }
  | { kind: 'slot'; next: number | null }
  | { kind: 'closed' };

/** Why an order cannot be sent yet, if anything. Pure, so the send button and the tests agree. */
export function checkOrder(
  state: ShopState,
  now: number,
  cart: readonly CartLine[],
  name: string,
  pickupAt: number | null,
): Problem[] {
  const problems: Problem[] = [];
  if (cart.length === 0) problems.push({ kind: 'empty' });
  const sold = cart.filter((l) => blockedBy(state, l.itemId, l.choices).length > 0).map((l) => l.key);
  if (sold.length) problems.push({ kind: 'soldout', keys: sold });
  if (!cleanName(name)) problems.push({ kind: 'name' });
  const offer = pickupSlots(state, now);
  if (offer.closed) problems.push({ kind: 'closed' });
  else {
    const open = offer.slots.filter((s) => !s.full);
    const ok = pickupAt !== null && open.some((s) => s.at === pickupAt);
    if (!ok) problems.push({ kind: 'slot', next: open[0]?.at ?? null });
  }
  return problems;
}

export function toOrder(id: string, cart: readonly CartLine[], name: string, pickupAt: number): PlacedOrder {
  return {
    id,
    name: cleanName(name),
    pickupAt,
    source: 'customer',
    lines: cart.map((l, j) => ({
      id: `l${j}`,
      itemId: l.itemId,
      qty: l.qty,
      choices: l.choices,
      unitCents: unitCents(l.itemId, l.choices),
    })),
  };
}
