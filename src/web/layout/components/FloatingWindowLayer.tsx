import { createPortal } from 'react-dom';
import type { DragState, WindowRecord } from '../types';
import type { WindowManager } from '../WindowManager';
import { FloatingPanel } from './FloatingPanel';

interface FloatingWindowLayerProps {
  windows: WindowRecord[];
  manager: WindowManager;
  onDragStateChange: (s: DragState | null) => void;
  onTitlebarContextMenu?: (e: React.MouseEvent) => void;
  /** Disables dock detection while dragging (used when layout mode is off). */
  disableDocking?: boolean;
}

export function FloatingWindowLayer({
  windows,
  manager,
  onDragStateChange,
  onTitlebarContextMenu,
  disableDocking,
}: FloatingWindowLayerProps) {
  const floating = windows.filter(w => !w.docked && w.visible && !w.poppedOut);

  return createPortal(
    <div className="floating-window-root">
      {floating.map(w => (
        <FloatingPanel
          key={w.id}
          window={w}
          manager={manager}
          onDragStateChange={onDragStateChange}
          onTitlebarContextMenu={onTitlebarContextMenu}
          disableDocking={disableDocking}
        />
      ))}
    </div>,
    document.body
  );
}
