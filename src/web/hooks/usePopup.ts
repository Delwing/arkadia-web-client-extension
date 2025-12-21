import { useCallback, useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { shouldPopupAutoOpen, getPopupLockedState } from '../layout/utils/layoutStorage';

export interface UsePopupOptions<T = unknown> {
    /** Event name that triggers opening the popup */
    openEvent?: string;
    /** Callback when open event is received, before popup opens */
    onOpen?: (data: T) => void;
}

export interface UsePopupResult {
    /** Whether the popup is currently open */
    isOpen: boolean;
    /** Whether the popup is pinned (won't close on outside click/escape) */
    isPinned: boolean;
    /** Whether the popup is locked (prevents dragging and resizing) */
    isLocked: boolean;
    /** Open the popup */
    open: () => void;
    /** Close the popup */
    close: () => void;
    /** Set isOpen state directly */
    setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
    /** Set isLocked state directly */
    setIsLocked: React.Dispatch<React.SetStateAction<boolean>>;
    /** Props to spread on DockablePopupWrapper */
    wrapperProps: {
        popupId: string;
        isOpen: boolean;
        isPinned: boolean;
        isLocked: boolean;
        onClose: () => void;
        onPinnedChange: (pinned: boolean) => void;
        onLockedChange: (locked: boolean) => void;
        onReset: () => void;
    };
}

/**
 * Hook that encapsulates common popup state management.
 *
 * Handles:
 * - Auto-open on page load if popup was pinned/docked
 * - isOpen/isPinned/isLocked state
 * - Optional event subscription for opening
 * - Returns spread-able props for DockablePopupWrapper
 *
 * @example
 * ```tsx
 * const { wrapperProps, open, close } = usePopup('popup:clock');
 *
 * return (
 *   <DockablePopupWrapper
 *     {...wrapperProps}
 *     popupType="clock"
 *     title="Clock"
 *     minWidth={300}
 *   >
 *     {content}
 *   </DockablePopupWrapper>
 * );
 * ```
 *
 * @example With open event
 * ```tsx
 * const { wrapperProps } = usePopup('popup:contracts', {
 *   openEvent: 'contracts.popup.open',
 *   onOpen: (data) => setContracts(data.contracts),
 * });
 * ```
 */
export function usePopup<T = unknown>(
    popupId: string,
    options?: UsePopupOptions<T>,
): UsePopupResult {
    const [isOpen, setIsOpen] = useState(() => shouldPopupAutoOpen(popupId));
    const [isPinned, setIsPinned] = useState(() => shouldPopupAutoOpen(popupId));
    const [isLocked, setIsLocked] = useState(() => getPopupLockedState(popupId));
    // Track reset trigger - increments on each reset request
    const [resetCounter, setResetCounter] = useState(0);

    const close = useCallback(() => setIsOpen(false), []);
    const open = useCallback(() => setIsOpen(true), []);

    const handlePinnedChange = useCallback((pinned: boolean) => {
        setIsPinned(pinned);
    }, []);

    const handleLockedChange = useCallback((locked: boolean) => {
        setIsLocked(locked);
    }, []);

    const handleReset = useCallback(() => {
        setResetCounter((c) => c + 1);
    }, []);

    // Subscribe to open event if provided
    useEffect(() => {
        if (!options?.openEvent) {
            return;
        }

        const unsubscribe = eventBus.on(options.openEvent, (data) => {
            options.onOpen?.(data as T);
            setIsOpen(true);
        });

        return unsubscribe;
    }, [options?.openEvent, options?.onOpen]);

    const wrapperProps = {
        popupId,
        isOpen,
        isPinned,
        isLocked,
        onClose: close,
        onPinnedChange: handlePinnedChange,
        onLockedChange: handleLockedChange,
        onReset: handleReset,
        resetCounter,
    };

    return {
        isOpen,
        isPinned,
        isLocked,
        open,
        close,
        setIsOpen,
        setIsLocked,
        wrapperProps,
    };
}
