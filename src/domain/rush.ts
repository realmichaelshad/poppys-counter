import type { OrderLine, ShopEvent } from './events';
import { itemById, MENU } from './menu';
import { unitCents, type Choices } from './pricing';
import type { Day } from './reduce';
import { ceilSlot, realAt, shopMinute } from './time';

// The morning rush: a seeded run of customers and two simulated cooks. The same seed and start time
// always produce the same events with the same ids, so every tab replays an identical rush and a
// reload replays it again without storing a single generated event.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RunPlan {
  /** Minutes over which customers arrive, from the run's start. */
  durationMin: number;
  /** Customers spread over the run on a triangle that peaks at this fraction of it. */
  orders: number;
  peak: number;
  /** Extra arrivals at fixed minutes from the run's start, so a run can end with tickets still open. */
  fixed: number[];
}

export const PLANS: Record<'opening' | 'rush', RunPlan> = {
  // From 6:30 until the visitor arrives at 8:20 (110 minutes), then two more over the next few minutes.
  opening: { durationMin: 108, orders: 54, peak: 0.58, fixed: [108.6, 109.2, 109.7, 110.4, 112.9] },
  // A burst: fourteen customers in two and a half minutes.
  rush: { durationMin: 2.5, orders: 13, peak: 0.3, fixed: [0] },
};

/** How long before the visitor arrived the opening run began (6:30 to 8:20). */
export const OPENING_LEAD_MIN = 110;

export const COOKS = 3;

const NAMES = [
  'Dana', 'Luis', 'Priya', 'Sam', 'Marisol', 'Theo', 'Aisha', 'Ben', 'Keiko', 'Omar', 'Ruth', 'Jonah',
  'Grace', 'Malik', 'Inés', 'Pete', 'Hana', 'Walt', 'Rosa', 'Eli', 'Nadia', 'Frank', 'Mei', 'Tom',
  'Yusuf', 'Carla', 'Ari', 'Bea', 'Dev', 'Lena', 'Marcus', 'June', 'Raf', 'Sofia', 'Gus', 'Noor',
  'Iris', 'Kofi', 'Ada', 'Moe',
];

type Weighted<T> = [T, number][];

function pick<T>(rng: () => number, table: Weighted<T>): T {
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [v, w] of table) {
    r -= w;
    if (r < 0) return v;
  }
  return table[table.length - 1][0];
}

const ITEM_WEIGHTS: Weighted<string> = [
  ['everything', 15], ['plain', 6], ['sesame', 8], ['poppy', 7], ['cinnamon', 4],
  ['the-poppy', 6], ['egg-cheese', 10], ['whitefish', 3],
  ['drip', 13], ['latte', 7], ['cold-brew', 4],
  ['tub-plain', 1], ['tub-scallion', 1], ['tub-veggie', 0.6], ['tub-honey', 0.6],
];

function chooseFor(rng: () => number, itemId: string): Choices {
  const item = itemById(itemId);
  const c: Choices = {};
  for (const g of item.groups) c[g.id] = g.kind === 'one' ? [g.initial ?? g.choices[0].id] : [];
  switch (item.category) {
    case 'bagels': {
      if (rng() < 0.55) c.toasted = ['yes'];
      const schmear = pick(rng, itemId === 'cinnamon'
        ? [['none', 2], ['plain', 3], ['honey', 6]]
        : [['none', 5], ['plain', 7], ['scallion', 5], ['veggie', 2], ['honey', 2]]);
      c.schmear = [schmear];
      const extras: string[] = [];
      if (schmear === 'none' && rng() < 0.45) extras.push('butter');
      if (rng() < 0.1) extras.push('tomato');
      if (schmear !== 'none' && rng() < 0.07) extras.push('lox');
      if (rng() < 0.05) extras.push('onion');
      c.extras = extras;
      break;
    }
    case 'sandwiches': {
      c.bagel = [pick(rng, [['everything', 6], ['plain', 3], ['sesame', 3], ['poppy', 3], ['cinnamon', 0.3]])];
      if (rng() < 0.6) c.toasted = ['yes'];
      if (itemId === 'egg-cheese') {
        const extras: string[] = [];
        if (rng() < 0.4) extras.push('bacon');
        if (rng() < 0.15) extras.push('avocado');
        if (rng() < 0.25) extras.push('hot');
        c.extras = extras;
      }
      break;
    }
    case 'coffee': {
      c.size = [rng() < 0.45 ? 'large' : 'small'];
      if (itemId === 'latte') {
        c.milk = [rng() < 0.3 ? 'oat' : 'whole'];
        if (rng() < 0.15) c.shot = ['yes'];
      } else {
        c.milk = [pick(rng, [['black', 5], ['whole', 3.5], ['oat', 1.5]])];
      }
      break;
    }
    case 'schmears': {
      if (rng() < 0.2) c.size = ['pound'];
      break;
    }
  }
  return c;
}

function prepSec(line: OrderLine): number {
  const item = itemById(line.itemId);
  const toast = line.choices.toasted?.length ? 20 : 0;
  return (item.prepSec + toast) * line.qty;
}

/** Arrival minutes on a triangular distribution, by inverting its CDF. */
function triangle(u: number, peak: number): number {
  return u < peak ? Math.sqrt(u * peak) : 1 - Math.sqrt((1 - u) * (1 - peak));
}

export interface RushRef {
  id: string;
  seed: number;
  plan: 'opening' | 'rush';
  startAt: number;
}

/** Every event of one run: the orders, and the cooks' bumps as they work through them. */
export function runEvents(rush: RushRef, day: Day): ShopEvent[] {
  const plan = PLANS[rush.plan];
  const rng = mulberry32(rush.seed);
  const minutes: number[] = [];
  for (let i = 0; i < plan.orders; i++) minutes.push(triangle(rng(), plan.peak) * plan.durationMin);
  minutes.push(...plan.fixed);
  minutes.sort((a, b) => a - b);

  const events: ShopEvent[] = [];
  const cookFree = new Array(COOKS).fill(rush.startAt);
  minutes.forEach((min, i) => {
    const placedAt = Math.round(rush.startAt + min * 60000);
    const nLines = pick(rng, [[1, 45], [2, 35], [3, 15], [4, 5]]);
    const lines: OrderLine[] = [];
    for (let j = 0; j < nLines; j++) {
      const itemId = pick(rng, ITEM_WEIGHTS);
      const choices = chooseFor(rng, itemId);
      const qty = itemById(itemId).category === 'bagels' && rng() < 0.22 ? (rng() < 0.3 ? 3 : 2) : 1;
      lines.push({ id: `l${j}`, itemId, qty, choices, unitCents: unitCents(itemId, choices) });
    }
    const name = NAMES[Math.floor(rng() * NAMES.length)];
    const leadMin = 8 + rng() * 7;
    const pickupAt = realAt(day, ceilSlot(shopMinute(day, placedAt) + leadMin));
    const orderId = `${rush.id}:o${i}`;
    events.push({
      type: 'order.placed',
      id: orderId,
      at: placedAt,
      order: { id: orderId, name, pickupAt, lines, source: 'rush' },
    });

    // The cook who is free first takes the ticket, after a short look at it.
    let c = 0;
    for (let k = 1; k < COOKS; k++) if (cookFree[k] < cookFree[c]) c = k;
    let t = Math.max(placedAt + (15 + rng() * 25) * 1000, cookFree[c]);
    lines.forEach((line) => {
      t += prepSec(line) * (0.8 + rng() * 0.5) * 1000;
      events.push({ type: 'item.bumped', id: `${rush.id}:b${i}.${line.id}`, at: Math.round(t), orderId, lineId: line.id });
    });
    cookFree[c] = t;
  });
  return events;
}

const cache = new Map<string, ShopEvent[]>();

/** The generated events of every rush in the log that are due by `now`. */
export function dueRushEvents(rushes: readonly RushRef[], day: Day | null, now: number): ShopEvent[] {
  if (!day) return [];
  const out: ShopEvent[] = [];
  for (const r of rushes) {
    const key = `${day.id}|${r.id}|${r.seed}|${r.startAt}|${r.plan}`;
    let evs = cache.get(key);
    if (!evs) {
      evs = runEvents(r, day);
      cache.set(key, evs);
    }
    for (const e of evs) if (e.at <= now) out.push(e);
  }
  return out;
}

/** Menu ids in menu order, for tests and the seed tables. */
export const MENU_IDS = MENU.map((m) => m.id);
