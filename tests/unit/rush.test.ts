import { describe, expect, it } from 'vitest';
import { newDay, rushEvent } from '../../src/domain/day';
import { kitchenTickets, ownerDay, shopAt } from '../../src/domain/derive';
import type { ShopEvent } from '../../src/domain/events';
import { fold } from '../../src/domain/reduce';
import { runEvents, mulberry32 } from '../../src/domain/rush';
import { MIN, T0 } from './helpers';

describe('morning rush', () => {
  const log = newDay(T0, 42);
  const day = fold(log).day!;
  const opening = fold(log).rushes[0];

  it('is deterministic for the same seed and different for another', () => {
    expect(runEvents(opening, day)).toEqual(runEvents(opening, day));
    expect(runEvents({ ...opening, seed: 43 }, day)).not.toEqual(runEvents(opening, day));
    const a = mulberry32(5);
    const b = mulberry32(5);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('gives every generated event a unique id', () => {
    const evs = runEvents(opening, day);
    expect(new Set(evs.map((e) => e.id)).size).toBe(evs.length);
  });

  it('plays the morning so far: busy at eight, a few tickets still open when the visitor arrives', () => {
    const s = shopAt(log, T0);
    const d = ownerDay(s, T0);
    expect(d.orders).toBeGreaterThan(50);
    expect(d.orders).toBeLessThan(70);
    const open = kitchenTickets(s, T0).length;
    expect(open).toBeGreaterThanOrEqual(2);
    expect(open).toBeLessThanOrEqual(5);
    const peak = d.quarters.reduce((m, q) => (q.orders > m.orders ? q : m));
    expect(peak.startMin).toBeGreaterThanOrEqual(7 * 60 + 15);
    expect(peak.startMin).toBeLessThanOrEqual(8 * 60);
    expect(d.avgReadyMs! / MIN).toBeGreaterThan(2);
    expect(d.avgReadyMs! / MIN).toBeLessThan(12);
  });

  it('keeps printing for a few minutes after the visitor arrives, then the cooks clear the kitchen', () => {
    const at0 = shopAt(log, T0).orders.length;
    expect(shopAt(log, T0 + 5 * MIN).orders.length).toBeGreaterThan(at0);
    expect(kitchenTickets(shopAt(log, T0 + 30 * MIN), T0 + 30 * MIN)).toHaveLength(0);
  });

  it('only includes what is due: nothing from the future leaks into the present', () => {
    const s = shopAt(log, T0);
    for (const o of s.orders) {
      expect(o.placedAt).toBeLessThanOrEqual(T0);
      if (o.readyAt !== null) expect(o.readyAt).toBeLessThanOrEqual(T0);
    }
  });

  it('keeps sold out items off the rush orders that come after', () => {
    const base = [...newDay(T0, 9)];
    const rush = rushEvent(fold(base), T0 + MIN, 'rush1');
    const withRush: ShopEvent[] = [...base, rush];
    const so: ShopEvent = { type: 'item.soldout', id: 'so', itemId: 'everything', at: T0 + MIN };
    const later = T0 + 6 * MIN;
    const without = shopAt(withRush, later).orders.filter((o) => o.placedAt > T0 + MIN);
    const withSo = shopAt([...withRush, so], later).orders.filter((o) => o.placedAt > T0 + MIN);
    expect(without.some((o) => o.lines.some((l) => l.itemId === 'everything'))).toBe(true);
    expect(withSo.some((o) => o.lines.some((l) => l.itemId === 'everything' || l.choices.bagel?.[0] === 'everything'))).toBe(false);
  });

  it('a rush fills the kitchen and pushes pickup later, deterministically', () => {
    const base = [...newDay(T0, 11)];
    const rush = rushEvent(fold(base), T0 + 10 * MIN, 'r');
    const evs = [...base, rush];
    const t = T0 + 13 * MIN;
    const a = kitchenTickets(shopAt(evs, t), t).length;
    expect(a).toBeGreaterThanOrEqual(6);
    expect(shopAt(evs, t)).toEqual(shopAt([...evs].reverse(), t));
  });
});
