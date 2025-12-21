import { useEffect, useRef, useState } from 'react';
import { DockablePopupWrapper } from '@web/layout/components/DockablePopupWrapper';
import type { PluginPopupType } from '@web/layout/types';

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
    const containerRef = useRef<HTMLDivElement>(null);

    const handlePinnedChange = (pinned: boolean) => {
        setIsPinned(pinned);
        onPinToggle?.(pinned);
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
            onClose={onClose}
            onPinnedChange={handlePinnedChange}
            minWidth={300}
            minHeight={200}
            initialWidth={400}
            initialHeight={300}
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
