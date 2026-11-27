import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** A sheet that rises from the bottom of its container: the phone frame on a wide screen, the page on a phone. */
export function Sheet({
  label,
  onClose,
  children,
  footer,
  class: cls = '',
  tone = 'paper',
}: {
  label: string;
  onClose: () => void;
  children: ComponentChildren;
  footer?: ComponentChildren;
  class?: string;
  tone?: 'paper' | 'ink';
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus?.({ preventScroll: true });
    };
  }, []);
  return (
    <div class={`sheet-wrap ${cls}`}>
      <div class="sheet-back" onClick={onClose} />
      <div class={`sheet tone-${tone}`} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} ref={panel}>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" class="close" onClick={onClick}>
      {label}
    </button>
  );
}
