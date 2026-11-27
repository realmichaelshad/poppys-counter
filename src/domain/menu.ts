// The menu. Prices are integer cents. Choices that are themselves menu items (a schmear on a bagel,
// the bagel a sandwich is built on) carry `itemRef`, so marking that item sold out also closes the choice.

export type Category = 'bagels' | 'schmears' | 'sandwiches' | 'coffee';

export interface Choice {
  id: string;
  label: string;
  cents: number;
  itemRef?: string;
}

export interface OptionGroup {
  id: string;
  label: string;
  /** one: pick exactly one. many: any number. toggle: a single yes or no. */
  kind: 'one' | 'many' | 'toggle';
  choices: Choice[];
  /** For `one` groups: the choice selected when the sheet opens. */
  initial?: string;
}

export type Art =
  | { kind: 'bagel'; topping: 'plain' | 'sesame' | 'poppy' | 'everything' | 'cinnamon' }
  | { kind: 'schmear'; flavor: SchmearFlavor }
  | { kind: 'sandwich'; filling: 'lox' | 'egg' | 'whitefish' }
  | { kind: 'cup'; style: 'drip' | 'latte' | 'cold' };

export type SchmearFlavor = 'plain' | 'scallion' | 'veggie' | 'honey';

export interface MenuItem {
  id: string;
  name: string;
  /** What the kitchen calls it on tickets and in the all-day count. */
  short: string;
  category: Category;
  cents: number;
  blurb: string;
  art: Art;
  groups: OptionGroup[];
  /** Seconds of kitchen work for one, used by the morning rush cooks and the pickup estimate. */
  prepSec: number;
}

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'bagels', label: 'Bagels' },
  { id: 'schmears', label: 'Schmears' },
  { id: 'sandwiches', label: 'Sandwiches' },
  { id: 'coffee', label: 'Coffee' },
];

const toasted: OptionGroup = {
  id: 'toasted',
  label: 'Toasted',
  kind: 'toggle',
  choices: [{ id: 'yes', label: 'Toasted', cents: 0 }],
};

const schmearOnBagel: OptionGroup = {
  id: 'schmear',
  label: 'Schmear',
  kind: 'one',
  initial: 'none',
  choices: [
    { id: 'none', label: 'No schmear', cents: 0 },
    { id: 'plain', label: 'Plain schmear', cents: 175, itemRef: 'tub-plain' },
    { id: 'scallion', label: 'Scallion schmear', cents: 195, itemRef: 'tub-scallion' },
    { id: 'veggie', label: 'Veggie schmear', cents: 195, itemRef: 'tub-veggie' },
    { id: 'honey', label: 'Honey walnut schmear', cents: 215, itemRef: 'tub-honey' },
  ],
};

const bagelExtras: OptionGroup = {
  id: 'extras',
  label: 'Extras',
  kind: 'many',
  choices: [
    { id: 'butter', label: 'Butter', cents: 75 },
    { id: 'tomato', label: 'Tomato', cents: 75 },
    { id: 'onion', label: 'Red onion', cents: 50 },
    { id: 'capers', label: 'Capers', cents: 75 },
    { id: 'lox', label: 'Lox', cents: 450 },
  ],
};

const bagelChoice: OptionGroup = {
  id: 'bagel',
  label: 'On a',
  kind: 'one',
  initial: 'everything',
  choices: [
    { id: 'plain', label: 'Plain bagel', cents: 0, itemRef: 'plain' },
    { id: 'sesame', label: 'Sesame bagel', cents: 0, itemRef: 'sesame' },
    { id: 'poppy', label: 'Poppy bagel', cents: 0, itemRef: 'poppy' },
    { id: 'everything', label: 'Everything bagel', cents: 0, itemRef: 'everything' },
    { id: 'cinnamon', label: 'Cinnamon raisin bagel', cents: 0, itemRef: 'cinnamon' },
  ],
};

const size: OptionGroup = {
  id: 'size',
  label: 'Size',
  kind: 'one',
  initial: 'small',
  choices: [
    { id: 'small', label: 'Small', cents: 0 },
    { id: 'large', label: 'Large', cents: 75 },
  ],
};

const milk = (initial: string): OptionGroup => ({
  id: 'milk',
  label: 'Milk',
  kind: 'one',
  initial,
  choices: [
    ...(initial === 'black' ? [{ id: 'black', label: 'Black', cents: 0 }] : []),
    { id: 'whole', label: 'Whole milk', cents: 0 },
    { id: 'oat', label: 'Oat milk', cents: 60 },
  ],
});

const bagel = (
  id: 'plain' | 'sesame' | 'poppy' | 'everything' | 'cinnamon',
  name: string,
  short: string,
  cents: number,
  blurb: string,
): MenuItem => ({
  id,
  name,
  short,
  category: 'bagels',
  cents,
  blurb,
  art: { kind: 'bagel', topping: id },
  groups: [toasted, schmearOnBagel, bagelExtras],
  prepSec: 45,
});

const tub = (flavor: SchmearFlavor, name: string, short: string, cents: number, blurb: string): MenuItem => ({
  id: `tub-${flavor}`,
  name,
  short,
  category: 'schmears',
  cents,
  blurb,
  art: { kind: 'schmear', flavor },
  groups: [
    {
      id: 'size',
      label: 'Size',
      kind: 'one',
      initial: 'half',
      choices: [
        { id: 'half', label: 'Half pound', cents: 0 },
        { id: 'pound', label: 'Full pound', cents: 550 },
      ],
    },
  ],
  prepSec: 20,
});

export const MENU: MenuItem[] = [
  bagel('plain', 'Plain bagel', 'Plain', 225, 'Boiled, then baked. Chewy inside, crackly outside.'),
  bagel('sesame', 'Sesame bagel', 'Sesame', 225, 'Rolled in toasted sesame on both sides.'),
  bagel('poppy', 'Poppy seed bagel', 'Poppy', 225, 'The one the shop is named for.'),
  bagel('everything', 'Everything bagel', 'Everything', 250, 'Sesame, poppy, garlic, onion and salt.'),
  bagel('cinnamon', 'Cinnamon raisin bagel', 'Cin raisin', 250, 'Sweet, soft, good with honey walnut.'),
  tub('plain', 'Plain schmear', 'Tub plain', 650, 'Whipped cream cheese, half a pound to take home.'),
  tub('scallion', 'Scallion schmear', 'Tub scallion', 695, 'Cream cheese with a lot of green onion.'),
  tub('veggie', 'Veggie schmear', 'Tub veggie', 695, 'Carrot, pepper, radish and cucumber, chopped fine.'),
  tub('honey', 'Honey walnut schmear', 'Tub honey', 750, 'Local honey and toasted walnuts.'),
  {
    id: 'the-poppy',
    name: 'The Poppy',
    short: 'The Poppy',
    category: 'sandwiches',
    cents: 1450,
    blurb: 'Lox, plain schmear, tomato, red onion and capers.',
    art: { kind: 'sandwich', filling: 'lox' },
    groups: [{ ...bagelChoice, initial: 'poppy' }, toasted],
    prepSec: 150,
  },
  {
    id: 'egg-cheese',
    name: 'Egg and cheese',
    short: 'Egg cheese',
    category: 'sandwiches',
    cents: 750,
    blurb: 'Two scrambled eggs and sharp cheddar, made to order.',
    art: { kind: 'sandwich', filling: 'egg' },
    groups: [
      bagelChoice,
      toasted,
      {
        id: 'extras',
        label: 'Extras',
        kind: 'many',
        choices: [
          { id: 'bacon', label: 'Bacon', cents: 250 },
          { id: 'avocado', label: 'Avocado', cents: 200 },
          { id: 'hot', label: 'Hot sauce', cents: 0 },
        ],
      },
    ],
    prepSec: 170,
  },
  {
    id: 'whitefish',
    name: 'Whitefish salad',
    short: 'Whitefish',
    category: 'sandwiches',
    cents: 1250,
    blurb: 'Smoked whitefish salad with lettuce and tomato.',
    art: { kind: 'sandwich', filling: 'whitefish' },
    groups: [{ ...bagelChoice, initial: 'plain' }, toasted],
    prepSec: 120,
  },
  {
    id: 'drip',
    name: 'Drip coffee',
    short: 'Drip',
    category: 'coffee',
    cents: 250,
    blurb: 'A medium roast, poured fresh all morning.',
    art: { kind: 'cup', style: 'drip' },
    groups: [size, milk('black')],
    prepSec: 30,
  },
  {
    id: 'latte',
    name: 'Latte',
    short: 'Latte',
    category: 'coffee',
    cents: 450,
    blurb: 'Two shots and steamed milk.',
    art: { kind: 'cup', style: 'latte' },
    groups: [
      size,
      milk('whole'),
      { id: 'shot', label: 'Extra shot', kind: 'toggle', choices: [{ id: 'yes', label: 'Extra shot', cents: 100 }] },
    ],
    prepSec: 75,
  },
  {
    id: 'cold-brew',
    name: 'Cold brew',
    short: 'Cold brew',
    category: 'coffee',
    cents: 450,
    blurb: 'Steeped overnight, served over ice.',
    art: { kind: 'cup', style: 'cold' },
    groups: [size, milk('black')],
    prepSec: 25,
  },
];

const BY_ID = new Map(MENU.map((m) => [m.id, m]));

export function itemById(id: string): MenuItem {
  const item = BY_ID.get(id);
  if (!item) throw new Error(`Unknown menu item ${id}`);
  return item;
}

export function hasItem(id: string): boolean {
  return BY_ID.has(id);
}
