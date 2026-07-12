import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Lock, LockOpen, PanelBottom, PanelLeft, PanelRight, PanelTop, type LucideIcon } from 'lucide-react';
import type { SplitDir } from '../types';

interface SplitContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
  /** dir = split axis, before = new empty cell goes before the panel. */
  onSplit: (dir: SplitDir, before: boolean) => void;
  /** Whether the UI is currently locked (frozen docked layout). */
  locked: boolean;
  /** Toggle the UI lock. */
  onToggleLock: () => void;
}

const ITEMS: Array<{ label: string; dir: SplitDir; before: boolean; Icon: LucideIcon }> = [
  { label: 'Podziel w lewo', dir: 'row', before: true, Icon: PanelLeft },
  { label: 'Podziel w prawo', dir: 'row', before: false, Icon: PanelRight },
  { label: 'Podziel w gore', dir: 'col', before: true, Icon: PanelTop },
  { label: 'Podziel w dol', dir: 'col', before: false, Icon: PanelBottom },
];

/** Small context menu offering to split a docked panel, inserting an empty
 *  placeholder cell beside it that a window can then be dropped into. */
export function SplitContextMenu({ x, y, onClose, onSplit, locked, onToggleLock }: SplitContextMenuProps) {
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
      {/* Splitting is a layout mutation, so it's only offered while unlocked. */}
      {!locked && ITEMS.map(item => (
        <button
          key={item.label}
          type="button"
          className="dropdown-item layout-split-menu__item"
          onClick={() => onSplit(item.dir, item.before)}
        >
          <span className="layout-split-menu__icon">
            <item.Icon size={16} />
          </span>
          {item.label}
        </button>
      ))}
      {!locked && <div className="layout-split-menu__sep" />}
      <button
        type="button"
        className="dropdown-item layout-split-menu__item"
        onClick={() => {
          onToggleLock();
          onClose();
        }}
      >
        <span className="layout-split-menu__icon">
          {locked ? <LockOpen size={16} /> : <Lock size={16} />}
        </span>
        {locked ? 'Odblokuj interfejs' : 'Zablokuj interfejs'}
      </button>
    </div>,
    document.body
  );
}
