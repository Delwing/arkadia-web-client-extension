import { useCallback, useRef, useState } from 'react';

export type ResizeOrientation = 'horizontal' | 'vertical';
export type ResizePosition = 'left' | 'right' | 'top' | 'bottom';

interface ResizeHandleProps {
  orientation: ResizeOrientation;
  position: ResizePosition;
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
  className?: string;
}

export function ResizeHandle({
  orientation,
  position,
  onResize,
  onResizeEnd,
  className = '',
}: ResizeHandleProps) {
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      startPosRef.current = orientation === 'horizontal' ? e.clientX : e.clientY;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const handleMove = (moveEvent: PointerEvent) => {
        const currentPos =
          orientation === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPosRef.current;

        // For left/top handles, delta is inverted
        const adjustedDelta =
          position === 'left' || position === 'top' ? -delta : delta;

        onResize(adjustedDelta);
        startPosRef.current = currentPos;
      };

      const handleUp = (upEvent: PointerEvent) => {
        setIsResizing(false);
        onResizeEnd?.();
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        (upEvent.target as HTMLElement)?.releasePointerCapture?.(upEvent.pointerId);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [orientation, position, onResize, onResizeEnd]
  );

  const baseClass = 'resize-handle';
  const orientationClass = `resize-handle--${orientation}`;
  const positionClass = `resize-handle--${position}`;
  const activeClass = isResizing ? 'resize-handle--active' : '';

  return (
    <div
      className={`${baseClass} ${orientationClass} ${positionClass} ${activeClass} ${className}`.trim()}
      onPointerDown={handlePointerDown}
    />
  );
}

interface PanelResizeHandleProps {
  orientation: ResizeOrientation;
  onResize: (delta: number) => void;
  onResizeEnd?: () => void;
}

export function PanelResizeHandle({
  orientation,
  onResize,
  onResizeEnd,
}: PanelResizeHandleProps) {
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef(0);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      startPosRef.current = orientation === 'horizontal' ? e.clientX : e.clientY;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const handleMove = (moveEvent: PointerEvent) => {
        const currentPos =
          orientation === 'horizontal' ? moveEvent.clientX : moveEvent.clientY;
        const delta = currentPos - startPosRef.current;
        onResize(delta);
        startPosRef.current = currentPos;
      };

      const handleUp = (upEvent: PointerEvent) => {
        setIsResizing(false);
        onResizeEnd?.();
        window.removeEventListener('pointermove', handleMove);
        window.removeEventListener('pointerup', handleUp);
        (upEvent.target as HTMLElement)?.releasePointerCapture?.(upEvent.pointerId);
      };

      window.addEventListener('pointermove', handleMove);
      window.addEventListener('pointerup', handleUp);
    },
    [orientation, onResize, onResizeEnd]
  );

  return (
    <div
      className={`panel-resize-handle panel-resize-handle--${orientation} ${isResizing ? 'panel-resize-handle--active' : ''}`}
      onPointerDown={handlePointerDown}
    />
  );
}
