import { describe, expect, it } from 'vitest';
import { newDay } from '../../src/domain/day';
import { kitchenTickets, ownerDay, shopAt } from '../../src/domain/derive';

// Every visitor gets a different seed, so the morning has to look like a working kitchen for any of them.
describe('the opening rush across seeds', () => {
  const T0 = Date.UTC(2026, 10, 21, 15);
  for (let k = 1; k <= 12; k++) {
    it(`seed ${k}: a busy but coping kitchen when the visitor arrives`, () => {
      const log = newDay(T0, k * 7717);
      const s = shopAt(log, T0);
      const d = ownerDay(s, T0);
      const open = kitchenTickets(s, T0).length;
      expect(open).toBeGreaterThanOrEqual(1);
      expect(open).toBeLessThanOrEqual(5);
      expect(d.late).toBe(0);
      expect(d.avgReadyMs! / 60000).toBeGreaterThan(2);
      expect(d.avgReadyMs! / 60000).toBeLessThan(10);
      // The cooks clear the rail within twenty minutes if nobody orders.
      expect(kitchenTickets(shopAt(log, T0 + 20 * 60000), T0 + 20 * 60000)).toHaveLength(0);
    });
  }
});
