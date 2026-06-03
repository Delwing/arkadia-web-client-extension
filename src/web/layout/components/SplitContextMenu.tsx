import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { SplitDir } from '../types';

interface SplitContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  /** dir = split axis, before = new empty cell goes before the panel. */
  onSplit: (dir: SplitDir, before: boolean) => void;
}

const ITEMS: Array<{ label: string; dir: SplitDir; before: boolean }> = [
  { label: 'Podziel w lewo', dir: 'row', before: true },
  { label: 'Podziel w prawo', dir: 'row', before: false },
  { label: 'Podziel w gore', dir: 'col', before: true },
  { label: 'Podziel w dol', dir: 'col', before: false },
];

/** Small context menu offering to split a docked panel, inserting an empty
 *  placeholder cell beside it that a window can then be dropped into. */
export function SplitContextMenu({ x, y, onClose, onSplit }: SplitContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Defer so the opening right-click doesn't immediately close it.
    const t = window.setTimeout(() => {
      document.addEventListener('pointerdown', onDown);
      document.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="layout-split-menu dropdown-menu show"
      style={{ position: 'fixed', left: x, top: y, zIndex: 2000, display: 'block' }}
    >
      {ITEMS.map(item => (
        <button
          key={item.label}
          type="button"
          className="dropdown-item layout-split-menu__item"
          onClick={() => onSplit(item.dir, item.before)}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body
  );
}
