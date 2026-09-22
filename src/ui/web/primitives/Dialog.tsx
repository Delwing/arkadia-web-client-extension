import { useEffect, useRef, type ReactNode } from 'react';

export interface DialogProps {
    title: ReactNode;
    onClose: () => void;
    children: ReactNode;
    /** Buttons row at the bottom (right-aligned; put a spacer first to push some left). */
    footer?: ReactNode;
    size?: 'sm' | 'md' | 'lg' | 'xl';
    /** Scroll inside the body when content is taller than the dialog. On by default. */
    scrollable?: boolean;
    /** Backdrop clicks, Escape and the × close the dialog. On by default. */
    dismissible?: boolean;
    /** Extra class on the dialog frame. */
    className?: string;
}

/**
 * A modal dialog: backdrop, frame, header (title + ×), body and footer.
 *
 * Rendered *inline* rather than portaled. Most dialogs still open over one of
 * stock's page-level windows (settings, triggers, aliases…) or forge's
 * menu modal; a portaled dialog there makes two focus managers fight over
 * focus (CPU pegged, inputs untypeable) and can leave a stray backdrop behind
 * when the host closes first. Inline, the dialog lives and dies with its host.
 * The backdrop is position: fixed, so it still covers the viewport.
 *
 * Escape is caught in the capture phase and stopped, so it closes this dialog
 * rather than the window underneath.
 */
export function Dialog({
    title,
    onClose,
    children,
    footer,
    size = 'md',
    scrollable = true,
    dismissible = true,
    className,
}: DialogProps) {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // A control that uses Escape itself (cancel an inline edit) opts out
            // with data-dialog-escape="local" and stops the key on its own.
            if ((event.target as Element | null)?.closest?.('[data-dialog-escape="local"]')) return;
            event.stopPropagation();
            if (dismissible) onCloseRef.current();
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [dismissible]);

    const frameClass = ['popup-dialog', `popup-dialog--${size}`, className].filter(Boolean).join(' ');

    return (
        <div
            className="popup-dialog-backdrop"
            onMouseDown={(e) => {
                // mousedown, not click: a text selection dragged out of an input
                // and released over the backdrop must not close the dialog.
                if (dismissible && e.target === e.currentTarget) onCloseRef.current();
            }}
        >
            <div className={frameClass} role="dialog">
                <div className="popup-dialog__header">
                    <h2 className="popup-dialog__title">{title}</h2>
                    {dismissible && (
                        <button type="button" className="popup-dialog__close" onClick={onClose} title="Zamknij">
                            &times;
                        </button>
                    )}
                </div>
                <div className={`popup-dialog__body${scrollable ? '' : ' popup-dialog__body--fit'}`}>{children}</div>
                {footer && <div className="popup-dialog__footer">{footer}</div>}
            </div>
        </div>
    );
}
