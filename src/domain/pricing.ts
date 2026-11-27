import { itemById, type MenuItem } from './menu';

/** Selected choice ids per option group. A toggle group is ['yes'] when on and [] when off. */
export type Choices = Record<string, string[]>;

export function defaultChoices(item: MenuItem): Choices {
  const out: Choices = {};
  for (const g of item.groups) {
    if (g.kind === 'one') out[g.id] = [g.initial ?? g.choices[0].id];
    else out[g.id] = [];
  }
  return out;
}

/** Keeps only known choices, exactly one in a `one` group, at most one in a toggle. */
export function normalizeChoices(item: MenuItem, choices: Choices): Choices {
  const out: Choices = {};
  for (const g of item.groups) {
    const known = (choices[g.id] ?? []).filter((id) => g.choices.some((c) => c.id === id));
    const unique = [...new Set(known)];
    if (g.kind === 'one') out[g.id] = [unique[0] ?? g.initial ?? g.choices[0].id];
    else if (g.kind === 'toggle') out[g.id] = unique.slice(0, 1);
    else out[g.id] = g.choices.filter((c) => unique.includes(c.id)).map((c) => c.id);
  }
  return out;
}

export function unitCents(itemId: string, choices: Choices): number {
  const item = itemById(itemId);
  const norm = normalizeChoices(item, choices);
  let cents = item.cents;
  for (const g of item.groups) {
    for (const id of norm[g.id]) cents += g.choices.find((c) => c.id === id)!.cents;
  }
  return cents;
}

/** Plain words for the chosen options, for the cart and the ticket: "Toasted, scallion schmear, tomato". */
export function describeChoices(itemId: string, choices: Choices): string[] {
  const item = itemById(itemId);
  const norm = normalizeChoices(item, choices);
  const words: string[] = [];
  for (const g of item.groups) {
    for (const id of norm[g.id]) {
      const c = g.choices.find((x) => x.id === id)!;
      // Defaults that change nothing are not worth printing.
      if (g.kind === 'one' && (id === 'none' || id === 'small' || id === 'half') && c.cents === 0) continue;
      words.push(c.label);
    }
  }
  return words;
}

/** Menu items a line depends on: the item itself and any choice that is an item (a schmear, a bagel). */
export function itemsUsed(itemId: string, choices: Choices): string[] {
  const item = itemById(itemId);
  const norm = normalizeChoices(item, choices);
  const used = [itemId];
  for (const g of item.groups) {
    for (const id of norm[g.id]) {
      const ref = g.choices.find((c) => c.id === id)?.itemRef;
      if (ref) used.push(ref);
    }
  }
  return used;
}

export function formatCents(cents: number): string {
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  return `${neg ? '-' : ''}$${dollars.toLocaleString('en-US')}.${rest}`;
}
