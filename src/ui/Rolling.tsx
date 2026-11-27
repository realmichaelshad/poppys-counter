import { useEffect, useRef, useState } from 'preact/hooks';
import { formatCents } from '../domain/pricing';
import { reducedMotion } from './state';

// The last value each named figure showed, so a figure that is remounted (switching views on a
// phone) rolls from where it was instead of appearing at its new value.
const last = new Map<string, number>();

const snap = new Set<string>();

/** Sets where a named figure rolls from the next time it is shown. With `jump`, a mounted figure
    goes straight to its next value instead of rolling (attract mode starting over). */
export function primeRolling(name: string, value: number, jump = false) {
  last.set(name, value);
  if (jump) snap.add(name);
}

/** A figure that rolls to its new value instead of jumping, in whole cents the whole way. */
export function useRolling(target: number, ms: number, name?: string): number {
  const start0 = name !== undefined && last.has(name) ? last.get(name)! : target;
  const [shown, setShown] = useState(start0);
  const from = useRef(start0);
  const raf = useRef(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const snapNow = name !== undefined && snap.delete(name);
    if (reducedMotion.value || ms <= 0 || snapNow) {
      from.current = target;
      if (name !== undefined) last.set(name, target);
      setShown(target);
      return;
    }
    const start = performance.now();
    const a = from.current;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      const v = Math.round(a + (target - a) * e);
      from.current = v;
      if (name !== undefined) last.set(name, v);
      setShown(v);
      if (k < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return shown;
}

export function RollingCents({ cents, ms = 450, name }: { cents: number; ms?: number; name?: string }) {
  const v = useRolling(cents, ms, name);
  return <span class="num">{formatCents(v)}</span>;
}

export function RollingInt({ value, ms = 450, name }: { value: number; ms?: number; name?: string }) {
  const v = useRolling(value, ms, name);
  return <span class="num">{v.toLocaleString('en-US')}</span>;
}
