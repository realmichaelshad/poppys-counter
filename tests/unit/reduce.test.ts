import { describe, expect, it } from 'vitest';
import type { ShopEvent } from '../../src/domain/events';
import { EMPTY, fold, reduce } from '../../src/domain/reduce';
import { bump, deepFreeze, line, MIN, opened, orderOf, placed, T0 } from './helpers';

describe('reduce', () => {
  it('opens the day once', () => {
    const s = fold([opened(), { ...opened(T0 + MIN), id: 'day2' }]);
    expect(s.day?.id).toBe('test-day');
    expect(s.day?.openedAt).toBe(T0);
  });

  it('places orders with numbers and exact totals in cents', () => {
    const s = fold([
      opened(),
      placed('a', T0 + 1000, [
        line('everything', 2, { toasted: ['yes'], schmear: ['scallion'] }, 'l0'),
        line('latte', 1, { size: ['large'], milk: ['oat'] }, 'l1'),
      ]),
      placed('b', T0 + 2000, [line('drip', 3, {}, 'l0')]),
    ]);
    expect(s.orders.map((o) => o.number)).toEqual([1, 2]);
    // (250 + 195) * 2 + (450 + 75 + 60)
    expect(orderOf(s, 'a').totalCents).toBe(1475);
    expect(orderOf(s, 'b').totalCents).toBe(750);
  });

  it('ignores the same order twice, and fold drops repeated event ids', () => {
    const ev = placed('a', T0 + 1000, [line('plain', 1, {}, 'l0')]);
    const s1 = fold([opened(), ev, { ...ev, id: 'other-id' }]);
    expect(s1.orders).toHaveLength(1);
    const b = bump('a', 'l0', T0 + 5000);
    const s2 = fold([opened(), ev, b, b, b]);
    expect(orderOf(s2, 'a').readyAt).toBe(T0 + 5000);
  });

  it('bumps lines one at a time and the last bump makes the order ready', () => {
    const base = [opened(), placed('a', T0, [line('plain', 1, {}, 'l0'), line('drip', 1, {}, 'l1')])];
    const s1 = fold([...base, bump('a', 'l1', T0 + 60000)]);
    expect(orderOf(s1, 'a').readyAt).toBeNull();
    expect(orderOf(s1, 'a').lines[1].bumpedAt).toBe(T0 + 60000);
    const s2 = fold([...base, bump('a', 'l1', T0 + 60000), bump('a', 'l0', T0 + 90000)]);
    expect(orderOf(s2, 'a').readyAt).toBe(T0 + 90000);
  });

  it('ignores bumps for unknown orders and lines, and bumps after ready', () => {
    const base = [opened(), placed('a', T0, [line('plain', 1, {}, 'l0')])];
    const s = fold([
      ...base,
      bump('zzz', 'l0', T0 + 1),
      bump('a', 'l9', T0 + 2),
      bump('a', 'l0', T0 + 3),
      bump('a', 'l0', T0 + 4),
    ]);
    expect(orderOf(s, 'a').readyAt).toBe(T0 + 3);
    expect(orderOf(s, 'a').lines[0].bumpedAt).toBe(T0 + 3);
  });

  it('bumping the whole ticket finishes every line; recall undoes only that bump', () => {
    const base: ShopEvent[] = [
      opened(),
      placed('a', T0, [line('plain', 1, {}, 'l0'), line('drip', 1, {}, 'l1'), line('latte', 1, {}, 'l2')]),
      bump('a', 'l0', T0 + 1000),
      { type: 'order.ready', id: 'r1', orderId: 'a', at: T0 + 2000 },
    ];
    const s1 = fold(base);
    expect(orderOf(s1, 'a').lines.map((l) => l.bumpedAt)).toEqual([T0 + 1000, T0 + 2000, T0 + 2000]);
    expect(orderOf(s1, 'a').readyAt).toBe(T0 + 2000);
    const s2 = fold([...base, { type: 'order.recalled', id: 'rc', orderId: 'a', at: T0 + 3000 }]);
    expect(orderOf(s2, 'a').readyAt).toBeNull();
    expect(orderOf(s2, 'a').lines.map((l) => l.bumpedAt)).toEqual([T0 + 1000, null, null]);
  });

  it('marks items sold out and back, idempotently, and ignores unknown items', () => {
    const s = fold([
      opened(),
      { type: 'item.soldout', id: 's1', itemId: 'everything', at: T0 + 1 },
      { type: 'item.soldout', id: 's2', itemId: 'everything', at: T0 + 2 },
      { type: 'item.soldout', id: 's3', itemId: 'unicorn', at: T0 + 3 },
      { type: 'item.soldout', id: 's4', itemId: 'latte', at: T0 + 4 },
      { type: 'item.back', id: 'b1', itemId: 'latte', at: T0 + 5 },
      { type: 'item.back', id: 'b2', itemId: 'latte', at: T0 + 6 },
    ]);
    expect(s.soldOut).toEqual({ everything: T0 + 1 });
  });

  it('drops sold out lines from a replayed rush order, and turns it away if nothing is left', () => {
    const s = fold([
      opened(),
      { type: 'item.soldout', id: 's', itemId: 'tub-scallion', at: T0 },
      placed('r1', T0 + 10, [line('everything', 1, { schmear: ['scallion'] }, 'l0'), line('drip', 1, {}, 'l1')], {
        source: 'rush',
      }),
      placed('r2', T0 + 20, [line('tub-scallion', 1, {}, 'l0')], { source: 'rush' }),
      placed('c1', T0 + 30, [line('tub-scallion', 1, {}, 'l0')], { source: 'customer' }),
    ]);
    expect(orderOf(s, 'r1').lines.map((l) => l.id)).toEqual(['l1']);
    expect(orderOf(s, 'r1').totalCents).toBe(250);
    expect(s.orders.find((o) => o.id === 'r2')).toBeUndefined();
    expect(s.turnedAway).toBe(1);
    // The menu checked the customer order when it was sent, so it is kept as written.
    expect(orderOf(s, 'c1').lines).toHaveLength(1);
  });

  it('is pure: a previous state is never changed', () => {
    let s = deepFreeze(fold([opened(), placed('a', T0, [line('plain', 1, {}, 'l0'), line('drip', 1, {}, 'l1')])]));
    s = deepFreeze(reduce(s, bump('a', 'l0', T0 + 1)));
    s = deepFreeze(reduce(s, { type: 'order.ready', id: 'r', orderId: 'a', at: T0 + 2 }));
    s = deepFreeze(reduce(s, { type: 'order.recalled', id: 'rc', orderId: 'a', at: T0 + 3 }));
    s = deepFreeze(reduce(s, { type: 'item.soldout', id: 'so', itemId: 'plain', at: T0 + 4 }));
    s = reduce(s, { type: 'item.back', id: 'bk', itemId: 'plain', at: T0 + 5 });
    expect(s.soldOut).toEqual({});
    expect(orderOf(s, 'a').lines.map((l) => l.bumpedAt)).toEqual([T0 + 1, null]);
    expect(EMPTY.day).toBeNull();
  });

  it('reaches the same state whatever order the events arrive in', () => {
    const evs: ShopEvent[] = [
      opened(),
      placed('a', T0 + 100, [line('plain', 1, {}, 'l0')]),
      placed('b', T0 + 200, [line('drip', 2, {}, 'l0'), line('latte', 1, {}, 'l1')]),
      bump('b', 'l0', T0 + 300),
      { type: 'item.soldout', id: 'so', itemId: 'latte', at: T0 + 350 },
      bump('a', 'l0', T0 + 400),
      { type: 'order.ready', id: 'r', orderId: 'b', at: T0 + 500 },
    ];
    const want = fold(evs);
    let seed = 3;
    for (let k = 0; k < 25; k++) {
      const shuffled = evs
        .map((e) => ({ e, r: (seed = (seed * 16807) % 2147483647) }))
        .sort((a, b) => a.r - b.r)
        .map((x) => x.e);
      expect(fold(shuffled)).toEqual(want);
    }
  });
});
