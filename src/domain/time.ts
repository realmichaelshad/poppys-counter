import type { Day } from './reduce';

// The shop keeps its own clock. A visit always lands at 8:20 in the morning, in the middle of the
// breakfast trade, and from there the shop clock runs at real speed. Events store real time; the
// day's opening event fixes how real time maps to shop time, so every tab shows the same clock.

export const OPEN_MIN = 6 * 60 + 30;
export const CLOSE_MIN = 14 * 60;
export const ARRIVE_MIN = 8 * 60 + 20;
export const SLOT_MIN = 5;

export function shopMinute(day: Day, at: number): number {
  return day.shopStartMin + (at - day.openedAt) / 60000;
}

export function realAt(day: Day, shopMin: number): number {
  return day.openedAt + (shopMin - day.shopStartMin) * 60000;
}

/** "8:35 am" */
export function formatClock(min: number): string {
  const whole = Math.floor(min + 1e-9);
  const h = Math.floor(whole / 60) % 24;
  const m = whole % 60;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

/** "8:35" without the am or pm, for tight places like the chart axis. */
export function formatClockShort(min: number): string {
  return formatClock(min).replace(/ [ap]m$/, '');
}

/** The first slot boundary at or after a shop minute. */
export function ceilSlot(min: number): number {
  return Math.ceil(min / SLOT_MIN - 1e-9) * SLOT_MIN;
}

/** "4 min", "1 h 05 min" */
export function formatDuration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  if (totalMin < 60) return `${totalMin} min`;
  return `${Math.floor(totalMin / 60)} h ${String(totalMin % 60).padStart(2, '0')} min`;
}

/** "6 min 40 s" for averages, "45 s" under a minute. */
export function formatMinSec(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}
