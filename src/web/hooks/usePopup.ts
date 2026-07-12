import {useCallback, useEffect, useState} from 'react';
import eventBus, {type ClientEvents} from '@modules/core/eventBus';
import {getPopupLockedState, getPopupPinnedState, shouldPopupAutoOpen} from '../layout/utils/layoutStorage';

export interface UsePopupOptions<K extends keyof ClientEvents = keyof ClientEvents> {
    /** Event name that triggers opening the popup */
    openEvent?: K;
    /** Callback when open event is received, before popup opens */
    onOpen?: (data: ClientEvents[K]) => void;
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
export function usePopup<K extends keyof ClientEvents = keyof ClientEvents>(
    popupId: string,
    options?: UsePopupOptions<K>,
): UsePopupResult {
    const [isOpen, setIsOpen] = useState(() => shouldPopupAutoOpen(popupId));
    // Seed pinned from the true persisted pin flag (persistOpen), NOT from
    // shouldPopupAutoOpen — the latter is also true whenever the popup is
    // docked, which would resurrect a pinned status the user had cleared while
    // the popup stayed docked (it can never read back as unpinned on reload).
    const [isPinned, setIsPinned] = useState(() => getPopupPinnedState(popupId));
    const [isLocked, setIsLocked] = useState(() => getPopupLockedState(popupId));
    // Track reset trigger - increments on each reset request
    const [resetCounter, setResetCounter] = useState(0);

    const close = useCallback(() => {
        // Unpin first so the popup won't be restored on page reload
        setIsPinned(false);
        setIsOpen(false);
    }, []);
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

        return eventBus.on(options.openEvent, ((data: ClientEvents[K]) => {
            options.onOpen?.(data);
            setIsOpen(true);
        }) as any);
    }, [options?.openEvent, options?.onOpen]);

    // Listen for layout state imports (settings import from file/cloud/device)
    // and re-evaluate auto-open state since the stored layout may have changed
    useEffect(() => {
        return eventBus.on('layoutManagerStateChanged', (data) => {
            if (data && typeof data === 'object' && 'type' in data && data.type === 'import') {
                if (shouldPopupAutoOpen(popupId)) {
                    setIsOpen(true);
                    // Mirror the imported pin flag rather than forcing pinned —
                    // a docked-but-unpinned popup must not become pinned on import.
                    setIsPinned(getPopupPinnedState(popupId));
                }
            }
        });
    }, [popupId]);

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
