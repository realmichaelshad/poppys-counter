import { computed, signal } from '@preact/signals';
import type { CartLine } from '../domain/cart';
import type { Choices } from '../domain/pricing';
import { Store } from '../store';

const params = new URLSearchParams(location.search);
export const ATTRACT = params.get('attract') === '1';

export const store = new Store({ mode: ATTRACT ? 'attract' : 'live' });
export const shop = computed(() => store.state.value);

export type View = 'menu' | 'kitchen' | 'owner';
export const view = signal<View>('menu');

export type MenuSheet =
  | { kind: 'item'; itemId: string; choices: Choices; qty: number }
  | { kind: 'cart' }
  | { kind: 'sent'; orderId: string }
  | null;
export const menuSheet = signal<MenuSheet>(null);
export const stockOpen = signal(false);
export const aboutOpen = signal(false);

export const cart = signal<CartLine[]>([]);
export const orderName = signal('');
export const pickupAt = signal<number | null>(null);

/** Orders sent from this tab, newest last. Kept for the session so a reload still shows their state. */
const MINE = 'poppys-counter:mine:v1';
function loadMine(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(MINE) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
export const myOrders = signal<string[]>(ATTRACT ? [] : loadMine());
export function rememberOrder(id: string) {
  myOrders.value = [...myOrders.value, id];
  if (store.opts.mode !== 'live') return;
  try {
    sessionStorage.setItem(MINE, JSON.stringify(myOrders.value));
  } catch {
    /* fine */
  }
}

/** Set once the visitor has looked at the kitchen, so the invitation to switch can stop. */
export const kitchenVisited = signal(false);

/** Three columns side by side, or one view at a time. */
// (540 px, not more: under a browser's own bars a 1366 x 768 laptop leaves about 580 px of
// height, and it should still get the three screens side by side, not the phone's tabs blown up)
const wideQuery = window.matchMedia('(min-width: 1260px) and (min-height: 540px)');
export const wide = signal(wideQuery.matches);
wideQuery.addEventListener('change', () => (wide.value = wideQuery.matches));

const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
export const reducedMotion = signal(motionQuery.matches);
motionQuery.addEventListener('change', () => (reducedMotion.value = motionQuery.matches));

/** Attract mode's hand on the screen: where the next tap lands, in page coordinates. */
export const fingerAt = signal<{ x: number; y: number; n: number } | null>(null);
export const attracting = signal(ATTRACT);
