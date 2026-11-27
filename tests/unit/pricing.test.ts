import { describe, expect, it } from 'vitest';
import { itemById, MENU } from '../../src/domain/menu';
import {
  defaultChoices,
  describeChoices,
  formatCents,
  itemsUsed,
  normalizeChoices,
  unitCents,
} from '../../src/domain/pricing';

describe('pricing', () => {
  it('prices every item at its menu price with the starting choices', () => {
    for (const item of MENU) expect(unitCents(item.id, defaultChoices(item))).toBe(item.cents);
  });

  it('adds choice prices in whole cents', () => {
    expect(unitCents('everything', { toasted: ['yes'], schmear: ['honey'], extras: ['lox', 'tomato'] })).toBe(
      250 + 215 + 450 + 75,
    );
    expect(unitCents('latte', { size: ['large'], milk: ['oat'], shot: ['yes'] })).toBe(450 + 75 + 60 + 100);
    expect(unitCents('tub-honey', { size: ['pound'] })).toBe(1300);
  });

  it('normalizes: one choice in a one-group, unknown ids dropped, extras in menu order', () => {
    const item = itemById('plain');
    expect(
      normalizeChoices(item, { schmear: ['scallion', 'plain'], extras: ['lox', 'nope', 'butter', 'lox'], bogus: ['x'] }),
    ).toEqual({ toasted: [], schmear: ['scallion'], extras: ['butter', 'lox'] });
    expect(normalizeChoices(item, {}).schmear).toEqual(['none']);
  });

  it('describes choices in plain words and leaves out defaults', () => {
    expect(describeChoices('everything', { toasted: ['yes'], schmear: ['scallion'], extras: ['tomato'] })).toEqual([
      'Toasted',
      'Scallion schmear',
      'Tomato',
    ]);
    expect(describeChoices('drip', { size: ['small'], milk: ['black'] })).toEqual(['Black']);
    expect(describeChoices('the-poppy', { bagel: ['sesame'] })).toEqual(['Sesame bagel']);
  });

  it('lists the items a line depends on', () => {
    expect(itemsUsed('everything', { schmear: ['scallion'] })).toEqual(['everything', 'tub-scallion']);
    expect(itemsUsed('egg-cheese', { bagel: ['poppy'] })).toEqual(['egg-cheese', 'poppy']);
  });

  it('formats cents without floating point error', () => {
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(1475)).toBe('$14.75');
    expect(formatCents(123456)).toBe('$1,234.56');
    let sum = 0;
    // A thousand coffees with oat milk: 310 cents each, summed in integers.
    for (let i = 0; i < 1000; i++) sum += unitCents('drip', { milk: ['oat'] });
    expect(formatCents(sum)).toBe('$3,100.00');
  });
});
