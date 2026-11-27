import type { OrderLine, ShopEvent } from '../../src/domain/events';
import { unitCents, type Choices } from '../../src/domain/pricing';
import type { ShopState } from '../../src/domain/reduce';
import { ARRIVE_MIN } from '../../src/domain/time';

export const T0 = Date.UTC(2026, 10, 21, 15, 0, 0);
export const MIN = 60000;

export function opened(at = T0): ShopEvent {
  return { type: 'day.opened', id: 'day', at, day: 'test-day', shopStartMin: ARRIVE_MIN, seed: 7 };
}

let n = 0;
export function line(itemId: string, qty = 1, choices: Choices = {}, id = `l${n++}`): OrderLine {
  return { id, itemId, qty, choices, unitCents: unitCents(itemId, choices) };
}

export function placed(
  id: string,
  at: number,
  lines: OrderLine[],
  opts: { name?: string; pickupAt?: number; source?: 'customer' | 'rush' } = {},
): ShopEvent {
  return {
    type: 'order.placed',
    id: `ev-${id}`,
    at,
    order: {
      id,
      name: opts.name ?? 'Dana',
      pickupAt: opts.pickupAt ?? at + 15 * MIN,
      lines,
      source: opts.source ?? 'customer',
    },
  };
}

export function bump(orderId: string, lineId: string, at: number): ShopEvent {
  return { type: 'item.bumped', id: `bump-${orderId}-${lineId}-${at}`, orderId, lineId, at };
}

export function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

export function orderOf(s: ShopState, id: string) {
  const o = s.orders.find((x) => x.id === id);
  if (!o) throw new Error('no order ' + id);
  return o;
}
