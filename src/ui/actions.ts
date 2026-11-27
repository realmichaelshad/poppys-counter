import { addLine, checkOrder, setQty, toOrder, type Problem } from '../domain/cart';
import { rushEvent } from '../domain/day';
import { pickupSlots } from '../domain/derive';
import type { Choices } from '../domain/pricing';
import { cart, menuSheet, orderName, pickupAt, rememberOrder, store } from './state';

export function addToCart(itemId: string, choices: Choices, qty: number) {
  cart.value = addLine(cart.value, itemId, choices, qty);
}

export function changeQty(key: string, qty: number) {
  cart.value = setQty(cart.value, key, qty);
}

export function removeLines(keys: string[]) {
  cart.value = cart.value.filter((l) => !keys.includes(l.key));
}

/** Keeps the chosen pickup slot valid: if it passed or filled up, move to the next open one. */
export function ensureSlot(): number | null {
  const offer = pickupSlots(store.state.value, store.time());
  const open = offer.slots.filter((s) => !s.full);
  if (!open.some((s) => s.at === pickupAt.value)) pickupAt.value = open[0]?.at ?? null;
  return pickupAt.value;
}

export function orderProblems(): Problem[] {
  return checkOrder(store.state.value, store.time(), cart.value, orderName.value, pickupAt.value);
}

/** Sends the order if it can be sent. Returns the problems otherwise. Nothing leaves the browser. */
export function sendOrder(): Problem[] | string {
  const problems = orderProblems();
  if (problems.length) return problems;
  const id = `o-${store.nextId()}`;
  store.dispatch({ type: 'order.placed', order: toOrder(id, cart.value, orderName.value, pickupAt.value!) });
  rememberOrder(id);
  cart.value = [];
  pickupAt.value = null;
  menuSheet.value = { kind: 'sent', orderId: id };
  return id;
}

export function bumpLine(orderId: string, lineId: string) {
  store.dispatch({ type: 'item.bumped', orderId, lineId });
}

export function bumpTicket(orderId: string) {
  store.dispatch({ type: 'order.ready', orderId });
}

export function recall(orderId: string) {
  store.dispatch({ type: 'order.recalled', orderId });
}

export function setSoldOut(itemId: string, soldOut: boolean) {
  store.dispatch(soldOut ? { type: 'item.soldout', itemId } : { type: 'item.back', itemId });
}

export function playRush() {
  const e = rushEvent(store.state.value, store.time(), 'x');
  store.dispatch({ type: 'rush.started', seed: e.type === 'rush.started' ? e.seed : 1, plan: 'rush', startAt: store.time() + 1200 });
}

export function startOver() {
  store.reset();
  cart.value = [];
  pickupAt.value = null;
  menuSheet.value = null;
}
