import { useEffect, useRef, useState } from 'react';
import { DockablePopupWrapper } from '@web/layout/components/DockablePopupWrapper';
import type { PluginPopupType } from '@web/layout/types';
import { getPopupLockedState } from '@web/layout/utils/layoutStorage';

// Compute viewport-aware initial width for plugin popups
function getInitialPopupWidth(): number {
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
    // Use 50% of viewport width, clamped between 350 and 700
    return Math.min(700, Math.max(350, Math.floor(viewportWidth * 0.5)));
}

export interface PluginPopupProps {
    popupId: string;
    popupType: PluginPopupType;
    title: string;
    body: string | Node;
    isOpen: boolean;
    isPinned?: boolean;
    onClose: () => void;
    onTitleChange?: (callback: (title: string) => void) => void;
    onBodyChange?: (callback: (body: string | Node) => void) => void;
    onPanelRef?: (element: HTMLDivElement | null) => void;
    /** Register setter to allow external code to change pinned state */
    onPinChange?: (callback: (pinned: boolean) => void) => void;
    /** Called when user toggles the pin button */
    onPinToggle?: (pinned: boolean) => void;
}

/**
 * PluginPopup component - draggable popup window for plugins
 * Uses DockablePopupWrapper for consistent drag behavior and docking support
 */
export function PluginPopup({
    popupId,
    popupType,
    title: initialTitle,
    body: initialBody,
    isOpen,
    isPinned: initialPinned = false,
    onClose,
    onTitleChange,
    onBodyChange,
    onPanelRef,
    onPinChange,
    onPinToggle
}: PluginPopupProps) {
    const [title, setTitle] = useState(initialTitle);
    const [body, setBody] = useState<string | Node>(initialBody);
    const [isPinned, setIsPinned] = useState(initialPinned);
    const [isLocked, setIsLocked] = useState(() => getPopupLockedState(popupId));
    const containerRef = useRef<HTMLDivElement>(null);
    // Compute initial width once on mount
    const [initialWidth] = useState(getInitialPopupWidth);

    const handlePinnedChange = (pinned: boolean) => {
        setIsPinned(pinned);
        onPinToggle?.(pinned);
    };

    const handleLockedChange = (locked: boolean) => {
        setIsLocked(locked);
    };

    // Register callbacks for external updates
    useEffect(() => {
        if (onTitleChange) {
            onTitleChange(setTitle);
        }
        if (onBodyChange) {
            onBodyChange(setBody);
        }
        if (onPinChange) {
            onPinChange(setIsPinned);
        }
    }, [onTitleChange, onBodyChange, onPinChange]);

    // Expose container ref to parent for panel access
    useEffect(() => {
        if (onPanelRef && containerRef.current) {
            onPanelRef(containerRef.current);
        }
    }, [onPanelRef, isOpen]);

    return (
        <DockablePopupWrapper
            popupId={popupId}
            popupType={popupType}
            title={title}
            isOpen={isOpen}
            isPinned={isPinned}
            isLocked={isLocked}
            onClose={onClose}
            onPinnedChange={handlePinnedChange}
            onLockedChange={handleLockedChange}
            minWidth={300}
            minHeight={150}
            initialWidth={initialWidth}
            className="plugin-window"
            bodyClassName="plugin-window-body"
        >
            <div ref={containerRef}>
                {typeof body === 'string' ? (
                    <div dangerouslySetInnerHTML={{ __html: body }} />
                ) : (
                    <div ref={(el) => {
                        if (el && body instanceof Node) {
                            el.innerHTML = '';
                            el.appendChild(body);
                        }
                    }} />
                )}
            </div>
        </DockablePopupWrapper>
    );
}
