import { describe, expect, it } from 'vitest';
import { addLine, checkOrder, cleanName, NAME_MAX, setQty, toOrder, cartTotal } from '../../src/domain/cart';
import {
  allDay,
  availability,
  blockedBy,
  choiceAvailable,
  kitchenTickets,
  LATE_MS,
  orderStatus,
  ownerDay,
  pickupSlots,
  SLOT_CAPACITY,
  WARN_MS,
} from '../../src/domain/derive';
import type { ShopEvent } from '../../src/domain/events';
import { itemById } from '../../src/domain/menu';
import { fold } from '../../src/domain/reduce';
import { ARRIVE_MIN, CLOSE_MIN, realAt } from '../../src/domain/time';
import { bump, line, MIN, opened, placed, T0 } from './helpers';

const soldOut = (itemId: string, at = T0): ShopEvent => ({ type: 'item.soldout', id: `so-${itemId}`, itemId, at });

describe('menu availability', () => {
  it('greys out a sold out item and any choice that is that item', () => {
    const s = fold([opened(), soldOut('tub-scallion')]);
    const avail = availability(s);
    expect(avail['tub-scallion']).toBe(false);
    expect(avail['everything']).toBe(true);
    const scallion = itemById('plain').groups.find((g) => g.id === 'schmear')!.choices.find((c) => c.id === 'scallion')!;
    expect(choiceAvailable(s, scallion)).toBe(false);
    expect(blockedBy(s, 'plain', { schmear: ['scallion'] })).toEqual(['tub-scallion']);
    expect(blockedBy(s, 'plain', { schmear: ['plain'] })).toEqual([]);
  });

  it('closes a sandwich when every bagel it could be on is sold out', () => {
    const all = ['plain', 'sesame', 'poppy', 'everything', 'cinnamon'];
    const s = fold([opened(), ...all.map((id) => soldOut(id))]);
    expect(availability(s)['egg-cheese']).toBe(false);
    expect(availability(s)['drip']).toBe(true);
    const s2 = fold([opened(), ...all.slice(1).map((id) => soldOut(id))]);
    expect(availability(s2)['egg-cheese']).toBe(true);
  });
});

describe('kitchen', () => {
  const evs: ShopEvent[] = [
    opened(),
    placed('a', T0, [line('everything', 2, {}, 'l0'), line('drip', 1, {}, 'l1')]),
    placed('b', T0 + MIN, [line('everything', 1, {}, 'l0'), line('latte', 1, {}, 'l1')]),
    placed('c', T0 + 2 * MIN, [line('plain', 3, {}, 'l0')]),
    placed('d', T0 + 3 * MIN, [line('drip', 1, {}, 'l0')]),
    placed('e', T0 + 3.5 * MIN, [line('cinnamon', 1, {}, 'l0')]),
    bump('b', 'l0', T0 + 4 * MIN),
    bump('d', 'l0', T0 + 4 * MIN),
  ];

  it('lists open tickets oldest first with their age and level', () => {
    const now = T0 + WARN_MS + MIN;
    const t = kitchenTickets(fold(evs), now);
    expect(t.map((x) => x.order.id)).toEqual(['a', 'b', 'c', 'e']);
    expect(t.map((x) => x.level)).toEqual(['waiting', 'waiting', 'fresh', 'fresh']);
    expect(kitchenTickets(fold(evs), T0 + LATE_MS)[0].level).toBe('late');
    // Three cooks: the three oldest are being made, and so is anything with a bump on it.
    expect(t.map((x) => x.making)).toEqual([true, true, true, false]);
  });

  it('counts what is still to make across every open ticket', () => {
    expect(allDay(fold(evs))).toEqual([
      { itemId: 'plain', name: 'Plain', count: 3 },
      { itemId: 'everything', name: 'Everything', count: 2 },
      { itemId: 'cinnamon', name: 'Cin raisin', count: 1 },
      { itemId: 'drip', name: 'Drip', count: 1 },
      { itemId: 'latte', name: 'Latte', count: 1 },
    ]);
  });

  it('handles twenty open tickets', () => {
    const many: ShopEvent[] = [opened()];
    for (let i = 0; i < 20; i++) many.push(placed(`o${i}`, T0 + i * 10000, [line('everything', 1, {}, 'l0'), line('drip', 2, {}, 'l1')]));
    const s = fold(many);
    const now = T0 + 5 * MIN;
    expect(kitchenTickets(s, now)).toHaveLength(20);
    expect(allDay(s).find((c) => c.itemId === 'drip')?.count).toBe(40);
    const busy = pickupSlots(s, now);
    const quiet = pickupSlots(fold([opened()]), now);
    expect(busy.slots[0].min).toBeGreaterThan(quiet.slots[0].min + 10);
  });
});

describe('customer status', () => {
  it('moves from received to being made to ready', () => {
    const base: ShopEvent[] = [
      opened(),
      placed('a', T0, [line('plain', 1, {}, 'l0')]),
      placed('b', T0 + 1, [line('plain', 1, {}, 'l0')]),
      placed('c', T0 + 1, [line('plain', 1, {}, 'l0')]),
      placed('me', T0 + 2, [line('drip', 1, {}, 'l0'), line('latte', 1, {}, 'l1')]),
    ];
    expect(orderStatus(fold(base), 'me')).toMatchObject({ stage: 'received', ahead: 3 });
    expect(orderStatus(fold([...base, bump('me', 'l1', T0 + 10)]), 'me')?.stage).toBe('making');
    expect(orderStatus(fold([...base, bump('a', 'l0', T0 + 10)]), 'me')).toMatchObject({ stage: 'making', ahead: 2 });
    const done = fold([...base, { type: 'order.ready', id: 'r', orderId: 'me', at: T0 + 20 }]);
    expect(orderStatus(done, 'me')?.stage).toBe('ready');
    expect(orderStatus(done, 'nope')).toBeNull();
  });
});

describe('pickup slots', () => {
  const day = fold([opened()]).day!;

  it('offers the first slot at least five minutes out on a quiet kitchen, on five minute marks', () => {
    const offer = pickupSlots(fold([opened()]), T0 + 30000);
    expect(offer.slots[0].min).toBe(ARRIVE_MIN + 10);
    expect(offer.slots.map((s) => s.min % 5)).toEqual(new Array(8).fill(0));
    expect(offer.slots[0].label).toBe('8:30 am');
  });

  it('pushes the first slot later as open tickets pile up', () => {
    let prev = 0;
    for (const n of [0, 4, 8, 14]) {
      const evs: ShopEvent[] = [opened()];
      for (let i = 0; i < n; i++) evs.push(placed(`o${i}`, T0, [line('egg-cheese', 1, {}, 'l0')]));
      const first = pickupSlots(fold(evs), T0).slots[0].min;
      expect(first).toBeGreaterThanOrEqual(prev);
      prev = first;
    }
    expect(prev).toBeGreaterThan(ARRIVE_MIN + 15);
  });

  it('marks a slot full when it already has four orders promised', () => {
    const at = realAt(day, ARRIVE_MIN + 15);
    const evs: ShopEvent[] = [opened()];
    for (let i = 0; i < SLOT_CAPACITY; i++) evs.push(placed(`o${i}`, T0, [line('drip', 1, {}, 'l0')], { pickupAt: at }));
    const slot = pickupSlots(fold(evs), T0).slots.find((s) => s.at === at)!;
    expect(slot.taken).toBe(SLOT_CAPACITY);
    expect(slot.full).toBe(true);
  });

  it('stops at closing time', () => {
    const late = realAt(day, CLOSE_MIN - 12);
    const offer = pickupSlots(fold([opened()]), late);
    expect(offer.slots.map((s) => s.label)).toEqual(['1:55 pm', '2:00 pm']);
    expect(pickupSlots(fold([opened()]), realAt(day, CLOSE_MIN)).closed).toBe(true);
  });
});

describe('owner figures', () => {
  it('computes sales, quarter hours, best sellers and the time to ready from the orders', () => {
    const day = fold([opened()]).day!;
    const at = (min: number) => realAt(day, min);
    const s = fold([
      opened(),
      placed('a', at(7 * 60 + 2), [line('everything', 2, {}, 'l0')]),
      placed('b', at(7 * 60 + 14), [line('drip', 1, {}, 'l0'), line('everything', 1, {}, 'l1')]),
      placed('c', at(7 * 60 + 31), [line('latte', 1, { size: ['large'] }, 'l0')]),
      bump('a', 'l0', at(7 * 60 + 8)),
      { type: 'order.ready', id: 'r', orderId: 'b', at: at(7 * 60 + 18) },
      soldOut('poppy', at(7 * 60 + 40)),
    ]);
    const d = ownerDay(s, T0);
    // Rung up when ready: a and b. c is still open.
    expect(d.salesCents).toBe(500 + 250 + 250);
    expect(d.pendingCents).toBe(525);
    expect(d.orders).toBe(3);
    expect(d.itemsSold).toBe(5);
    expect(d.avgTicketCents).toBe(500);
    expect(d.avgReadyMs).toBe(5 * MIN);
    expect(d.readyCount).toBe(2);
    expect(d.open).toBe(1);
    const q = (min: number) => d.quarters.find((x) => x.startMin === min)!;
    expect(q(7 * 60)).toEqual({ startMin: 420, orders: 2, cents: 1000 });
    expect(q(7 * 60 + 30)).toEqual({ startMin: 450, orders: 1, cents: 525 });
    expect(d.quarters[0].startMin).toBe(6 * 60 + 30);
    expect(d.quarters.at(-1)!.startMin).toBe(8 * 60 + 15);
    expect(d.best[0]).toEqual({ itemId: 'everything', name: 'Everything bagel', qty: 3, cents: 750 });
    expect(d.soldOut).toEqual([{ itemId: 'poppy', name: 'Poppy seed bagel', sinceMin: 460 }]);
  });

  it('has no average before the first order is ready', () => {
    expect(ownerDay(fold([opened()]), T0).avgReadyMs).toBeNull();
  });
});

describe('cart', () => {
  it('merges identical lines and removes a line at zero', () => {
    let cart = addLine([], 'everything', { schmear: ['plain'] }, 1);
    cart = addLine(cart, 'everything', { schmear: ['plain'], toasted: [] }, 2);
    cart = addLine(cart, 'everything', { schmear: ['scallion'] }, 1);
    expect(cart.map((l) => l.qty)).toEqual([3, 1]);
    expect(cartTotal(cart)).toBe(3 * 425 + 445);
    cart = setQty(cart, cart[0].key, 0);
    expect(cart).toHaveLength(1);
  });

  it('cleans the order name and caps a very long one', () => {
    expect(cleanName('   Dana    K  ')).toBe('Dana K');
    expect(cleanName('x'.repeat(200))).toHaveLength(NAME_MAX);
    expect(cleanName('   ')).toBe('');
  });

  it('will not send an empty cart, a sold out item, a missing name or a passed slot', () => {
    const s0 = fold([opened()]);
    const now = T0 + 30000;
    const slot = pickupSlots(s0, now).slots[0];
    const cart = addLine([], 'everything', { schmear: ['scallion'] }, 1);
    expect(checkOrder(s0, now, cart, 'Dana', slot.at)).toEqual([]);
    expect(checkOrder(s0, now, [], 'Dana', slot.at).map((p) => p.kind)).toEqual(['empty']);
    expect(checkOrder(s0, now, cart, '  ', slot.at).map((p) => p.kind)).toEqual(['name']);
    // Sold out while it sat in the cart.
    const s1 = fold([opened(), soldOut('tub-scallion', T0 + 1000)]);
    expect(checkOrder(s1, now + 2000, cart, 'Dana', slot.at)).toEqual([{ kind: 'soldout', keys: [cart[0].key] }]);
    // The clock passes the chosen slot: it is refused and the next real slot is offered.
    const later = T0 + 6 * MIN;
    const problems = checkOrder(s0, later, cart, 'Dana', slot.at);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toEqual({ kind: 'slot', next: pickupSlots(s0, later).slots[0].at });
  });

  it('turns the cart into an order with prices fixed at sending', () => {
    const cart = addLine(addLine([], 'latte', { milk: ['oat'] }, 2), 'plain', {}, 1);
    const o = toOrder('me', cart, ' Ana   Lucía ', 123);
    expect(o.name).toBe('Ana Lucía');
    expect(o.lines.map((l) => [l.id, l.itemId, l.qty, l.unitCents])).toEqual([
      ['l0', 'latte', 2, 510],
      ['l1', 'plain', 1, 225],
    ]);
  });
});
