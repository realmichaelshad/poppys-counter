import type { ShopEvent } from './events';
import type { ShopState } from './reduce';
import { OPENING_LEAD_MIN } from './rush';
import { ARRIVE_MIN } from './time';

/** A fresh day: the shop opened at 6:30, the visitor walks in at 8:20, and the morning so far replays from a seed. */
export function newDay(now: number, seed: number): ShopEvent[] {
  const day = `d${seed.toString(36)}-${now.toString(36)}`;
  return [
    { type: 'day.opened', id: `${day}:open`, at: now, day, shopStartMin: ARRIVE_MIN, seed },
    {
      type: 'rush.started',
      id: `${day}:morning`,
      at: now,
      seed,
      plan: 'opening',
      startAt: now - OPENING_LEAD_MIN * 60000,
    },
  ];
}

/** A burst of customers, starting a moment from now. Each rush in a day gets its own seed. */
export function rushEvent(state: ShopState, now: number, id: string): ShopEvent {
  const n = state.rushes.filter((r) => r.plan === 'rush').length;
  const seed = ((state.day?.seed ?? 1) + 7919 * (n + 1)) >>> 0;
  return { type: 'rush.started', id, at: now, seed, plan: 'rush', startAt: now + 1200 };
}

/** True while a rush still has customers to come. */
export function rushPlaying(state: ShopState, now: number): boolean {
  return state.rushes.some((r) => r.plan === 'rush' && now < r.startAt + 2.6 * 60000);
}
