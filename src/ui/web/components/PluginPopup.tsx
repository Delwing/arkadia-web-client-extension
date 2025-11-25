import { useEffect, useState } from 'react';
import { useDraggablePopup } from '@web/hooks/useDraggablePopup';

export interface PluginPopupProps {
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
 * Uses useDraggablePopup hook for consistent drag behavior
 */
export function PluginPopup({
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

    const togglePinned = () => {
        const newPinned = !isPinned;
        setIsPinned(newPinned);
        onPinToggle?.(newPinned);
    };

    const { panelRef, position, size, handlePointerDown, handleResizePointerDown } = useDraggablePopup({
        isOpen,
        isPinned,
        onClose,
        minWidth: 300,
        minHeight: 200
    });

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

    // Expose panel ref to parent
    useEffect(() => {
        if (onPanelRef && panelRef.current) {
            onPanelRef(panelRef.current);
        }
    }, [onPanelRef, panelRef]);

    if (!isOpen) {
        return null;
    }

    const positionStyle: React.CSSProperties = {
        ...(position ? {
            position: 'fixed' as const,
            left: `${position.left}px`,
            top: `${position.top}px`,
        } : {}),
        ...(size ? { width: `${size.width}px`, height: `${size.height}px` } : {})
    };

    const className = position
        ? 'plugin-window plugin-window--floating'
        : 'plugin-window plugin-window--center';

    return (
        <>
            <div ref={panelRef} className={className} style={positionStyle} tabIndex={-1}>
                <div className="plugin-window-inner">
                    <div className="plugin-window-header" onPointerDown={handlePointerDown}>
                        <h5 className="plugin-window-title">{title}</h5>
                        <div
                            className="window-header-actions"
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <button
                                type="button"
                                className={`window-pin-button${isPinned ? ' window-pin-button--active' : ''}`}
                                onClick={togglePinned}
                                title={isPinned ? 'Odepnij okno' : 'Przypnij okno'}
                            />
                            <button type="button" className="btn-close" onClick={onClose} />
                        </div>
                    </div>
                    <div className="plugin-window-body">
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
                    <div
                        className="plugin-window-resize-handle"
                        onPointerDown={handleResizePointerDown}
                        title="Drag to resize"
                    />
                </div>
            </div>
        </>
    );
}
