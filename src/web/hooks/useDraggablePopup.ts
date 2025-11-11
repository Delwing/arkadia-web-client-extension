import { useCallback, useEffect, useRef, useState } from 'react';

type PointerDragState = {
    pointerId: number;
    offsetX: number;
    offsetY: number;
};

type Position = {
    left: number;
    top: number;
};

type Size = {
    width: number;
    height: number;
};

type PointerResizeState = {
    pointerId: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
};

type UseDraggablePopupOptions = {
    isOpen: boolean;
    isPinned: boolean;
    onClose: () => void;
    minWidth?: number;
    minHeight?: number;
};

type UseDraggablePopupReturn = {
    panelRef: React.RefObject<HTMLDivElement>;
    position: Position | null;
    size: Size | null;
    handlePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    handleResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
};

function clamp(value: number, min: number, max: number): number {
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
}

/**
 * Hook for creating draggable and resizable popup windows with consistent behavior.
 *
 * Features:
 * - Drag window by header
 * - Resize window from corner handle
 * - Close on Escape key (unless pinned)
 * - Close on outside click (unless pinned)
 * - Keep window within viewport bounds
 * - Auto-adjust position on window resize
 */
export function useDraggablePopup({
    isOpen,
    isPinned,
    onClose,
    minWidth = 200,
    minHeight = 150
}: UseDraggablePopupOptions): UseDraggablePopupReturn {
    const [position, setPosition] = useState<Position | null>(null);
    const [size, setSize] = useState<Size | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const dragState = useRef<PointerDragState | null>(null);
    const resizeState = useRef<PointerResizeState | null>(null);

    const ensureVisiblePosition = useCallback((prev: Position | null): Position | null => {
        if (!prev || !panelRef.current) {
            return prev;
        }
        const margin = 16;
        const width = panelRef.current.offsetWidth;
        const height = panelRef.current.offsetHeight;
        const maxLeft = Math.max(margin, window.innerWidth - width - margin);
        const maxTop = Math.max(margin, window.innerHeight - height - margin);
        const nextLeft = clamp(prev.left, margin, maxLeft);
        const nextTop = clamp(prev.top, margin, maxTop);
        if (nextLeft === prev.left && nextTop === prev.top) {
            return prev;
        }
        return { left: nextLeft, top: nextTop };
    }, []);

    const handlePointerMove = useCallback((event: PointerEvent) => {
        const drag = dragState.current;
        if (!drag || event.pointerId !== drag.pointerId || !panelRef.current) {
            return;
        }
        const margin = 16;
        const width = panelRef.current.offsetWidth;
        const height = panelRef.current.offsetHeight;
        const maxLeft = Math.max(margin, window.innerWidth - width - margin);
        const maxTop = Math.max(margin, window.innerHeight - height - margin);
        const nextLeft = clamp(event.clientX - drag.offsetX, margin, maxLeft);
        const nextTop = clamp(event.clientY - drag.offsetY, margin, maxTop);
        setPosition({ left: nextLeft, top: nextTop });
    }, []);

    const endPointerDrag = useCallback(
        (event: PointerEvent) => {
            const drag = dragState.current;
            if (!drag || event.pointerId !== drag.pointerId) {
                return;
            }
            dragState.current = null;
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', endPointerDrag);
            window.removeEventListener('pointercancel', endPointerDrag);
        },
        [handlePointerMove],
    );

    const handlePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) {
                return;
            }
            if (!panelRef.current) {
                return;
            }
            const rect = panelRef.current.getBoundingClientRect();
            dragState.current = {
                pointerId: event.pointerId,
                offsetX: event.clientX - rect.left,
                offsetY: event.clientY - rect.top,
            };
            setPosition((prev) => prev ?? { left: rect.left, top: rect.top });
            window.addEventListener('pointermove', handlePointerMove);
            window.addEventListener('pointerup', endPointerDrag);
            window.addEventListener('pointercancel', endPointerDrag);
            event.preventDefault();
        },
        [endPointerDrag, handlePointerMove],
    );

    // Cleanup drag listeners on unmount
    useEffect(() => {
        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', endPointerDrag);
            window.removeEventListener('pointercancel', endPointerDrag);
        };
    }, [endPointerDrag, handlePointerMove]);

    // Cleanup drag listeners when closed
    useEffect(() => {
        if (isOpen) {
            return;
        }
        dragState.current = null;
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', endPointerDrag);
        window.removeEventListener('pointercancel', endPointerDrag);
    }, [endPointerDrag, handlePointerMove, isOpen]);

    // Handle window resize - keep popup visible
    useEffect(() => {
        const handleResize = () => {
            setPosition((prev) => ensureVisiblePosition(prev));
        };
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, [ensureVisiblePosition]);

    // Handle Escape key to close (unless pinned)
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" && !isPinned) {
                event.preventDefault();
                onClose();
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen, isPinned, onClose]);

    // Handle outside click to close (unless pinned)
    useEffect(() => {
        if (!isOpen || isPinned) {
            return;
        }
        const handlePointerDownOutside = (event: PointerEvent) => {
            const target = event.target as Node | null;
            if (target && panelRef.current?.contains(target)) {
                return;
            }
            onClose();
        };
        window.addEventListener("pointerdown", handlePointerDownOutside);
        return () => window.removeEventListener("pointerdown", handlePointerDownOutside);
    }, [isOpen, isPinned, onClose]);

    // Resize handlers
    const handleResizePointerMove = useCallback(
        (event: PointerEvent) => {
            const resize = resizeState.current;
            if (!resize || event.pointerId !== resize.pointerId || !panelRef.current) {
                return;
            }

            const deltaX = event.clientX - resize.startX;
            const deltaY = event.clientY - resize.startY;
            const newWidth = Math.max(minWidth, resize.startWidth + deltaX);
            const newHeight = Math.max(minHeight, resize.startHeight + deltaY);

            setSize({ width: newWidth, height: newHeight });
        },
        [minWidth, minHeight]
    );

    const endResizePointerDrag = useCallback(
        (event: PointerEvent) => {
            const resize = resizeState.current;
            if (!resize || event.pointerId !== resize.pointerId) {
                return;
            }
            resizeState.current = null;
            window.removeEventListener('pointermove', handleResizePointerMove);
            window.removeEventListener('pointerup', endResizePointerDrag);
            window.removeEventListener('pointercancel', endResizePointerDrag);
        },
        [handleResizePointerMove]
    );

    const handleResizePointerDown = useCallback(
        (event: React.PointerEvent<HTMLDivElement>) => {
            if (event.button !== 0) {
                return;
            }
            if (!panelRef.current) {
                return;
            }

            const rect = panelRef.current.getBoundingClientRect();
            resizeState.current = {
                pointerId: event.pointerId,
                startX: event.clientX,
                startY: event.clientY,
                startWidth: rect.width,
                startHeight: rect.height,
            };

            // Set initial position and size if not already set
            // This converts the window from centered to fixed position
            setPosition((prev) => prev ?? { left: rect.left, top: rect.top });
            setSize((prev) => prev ?? { width: rect.width, height: rect.height });

            window.addEventListener('pointermove', handleResizePointerMove);
            window.addEventListener('pointerup', endResizePointerDrag);
            window.addEventListener('pointercancel', endResizePointerDrag);
            event.preventDefault();
            event.stopPropagation(); // Prevent drag from starting
        },
        [endResizePointerDrag, handleResizePointerMove]
    );

    // Cleanup resize listeners on unmount
    useEffect(() => {
        return () => {
            window.removeEventListener('pointermove', handleResizePointerMove);
            window.removeEventListener('pointerup', endResizePointerDrag);
            window.removeEventListener('pointercancel', endResizePointerDrag);
        };
    }, [endResizePointerDrag, handleResizePointerMove]);

    // Cleanup resize listeners when closed
    useEffect(() => {
        if (isOpen) {
            return;
        }
        resizeState.current = null;
        window.removeEventListener('pointermove', handleResizePointerMove);
        window.removeEventListener('pointerup', endResizePointerDrag);
        window.removeEventListener('pointercancel', endResizePointerDrag);
    }, [endResizePointerDrag, handleResizePointerMove, isOpen]);

    return {
        panelRef,
        position,
        size,
        handlePointerDown,
        handleResizePointerDown,
    };
}
