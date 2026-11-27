import { fingerAt } from './state';

/** Attract mode's fingertip: a ring that presses where the demo taps, so a recording reads as a person using it. */
export function Finger() {
  const f = fingerAt.value;
  if (!f) return null;
  return <span class="finger" key={f.n} style={{ left: `${f.x}px`, top: `${f.y}px` }} aria-hidden="true" />;
}
