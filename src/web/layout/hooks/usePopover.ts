import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useBackLayer } from '@web-ui/backNavigation.ts';

interface UsePopoverOptions {
  /** Fixed panel width; when set the panel's right edge lines up with the button's
   *  and it is kept inside the viewport. Without it the panel sizes to content. */
  width?: number;
  /** Upper bound for the panel height; it shrinks further to fit below the button. */
  maxHeight?: number;
  /** Open above the button (a control at the bottom of the screen). Default: below. */
  placement?: 'below' | 'above';
  /** Called whenever the panel closes (click-away, Escape, or close()). */
  onClose?: () => void;
}

/**
 * Open/close state and placement for a panel anchored under a header button
 * (header menus, the window settings cog).
 *
 * The panel is position: fixed, placed from the button's rect, so a small docked
 * window can't clip it. Everything — the viewport it fits into, the document
 * click-away and Escape are heard on — is the button's own document, so it keeps
 * working after the window is popped out into another browser window. On a
 * phone, Back closes it too.
 */
export function usePopover({ width, maxHeight = 360, placement = 'below', onClose }: UsePopoverOptions = {}) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const close = useCallback(() => {
    setOpen(false);
    onCloseRef.current?.();
  }, []);

  const toggle = useCallback(() => {
    setOpen(o => {
      if (o) onCloseRef.current?.();
      return !o;
    });
  }, []);

  useBackLayer(open, close);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const anchor = anchorRef.current;
    const view = anchor.ownerDocument.defaultView ?? window;
    const rect = anchor.getBoundingClientRect();
    const top = rect.bottom + 4;
    const above = placement === 'above';
    const fit = Math.max(100, Math.min(maxHeight, above ? rect.top - 16 : view.innerHeight - top - 12));
    const vertical = above ? { bottom: view.innerHeight - rect.top + 4 } : { top };
    setStyle(
      width !== undefined
        ? {
            ...vertical,
            left: Math.max(8, Math.min(rect.right - width, view.innerWidth - width - 8)),
            width,
            maxHeight: fit,
          }
        : { ...vertical, right: Math.max(8, view.innerWidth - rect.right), maxHeight: fit },
    );
  }, [open, width, maxHeight, placement]);

  useEffect(() => {
    if (!open || !rootRef.current) return;
    const doc = rootRef.current.ownerDocument;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    doc.addEventListener('pointerdown', onPointerDown);
    doc.addEventListener('keydown', onKeyDown);
    return () => {
      doc.removeEventListener('pointerdown', onPointerDown);
      doc.removeEventListener('keydown', onKeyDown);
    };
  }, [open, close]);

  return {
    open,
    toggle,
    close,
    rootRef,
    anchorRef,
    /** Inline placement for the panel; null while closed or until measured. */
    style: open ? style : null,
  };
}

export type Popover = ReturnType<typeof usePopover>;
