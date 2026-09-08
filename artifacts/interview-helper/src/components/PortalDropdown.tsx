import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

interface PortalDropdownProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  align?: 'left' | 'right';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/**
 * Renders a dropdown panel into document.body so it escapes every ancestor
 * stacking context and clipping container — it always overlays the rest of the
 * UI. Position is anchored to `anchorRef` (the trigger) and re-tracked on
 * resize/scroll. Click-outside closes it, while clicks on the trigger or the
 * panel itself are ignored so item clicks still fire before close.
 */
export function PortalDropdown({ open, anchorRef, onClose, align = 'right', className = '', style, children }: PortalDropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (align === 'left') {
        setPos({ top: r.bottom + 4, left: Math.max(8, r.left) });
      } else {
        setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
      }
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchorRef, align]);

  useLayoutEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (anchorRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, anchorRef, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={panelRef}
      className={`fixed z-[9999] ${className}`}
      style={{ top: pos.top, left: pos.left, right: pos.right, ...style }}
    >
      {children}
    </div>,
    document.body,
  );
}
