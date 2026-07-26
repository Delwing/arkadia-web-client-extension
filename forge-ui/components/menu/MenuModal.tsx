import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A forged modal shell for menu-launched settings/editors.
 *
 * The stock UI hosts these components (Skrypty, Triggery, Aliasy, …) inside
 * Bootstrap modals; forge has no Bootstrap CSS, so this reuses the sidebar's
 * `.forged.panel` chrome instead and portals it to `document.body` as a centred
 * dialog over a dimming backdrop. The body carries `.forge-menu-modal`, the scope
 * under which menu.css maps the components' Bootstrap form classes to the forge
 * palette.
 *
 * Closing: the backdrop, the header "×", and Esc all call `onClose`. Several
 * option components dispatch `close-options` / `close-ui-settings` on save/cancel
 * (the same contract the stock modals honour) — the host listens for those and
 * calls `onClose`, so this component stays presentational.
 */
interface MenuModalProps {
    title: string;
    onClose: () => void;
    /** id set on the dialog element — some components (UiSettings) look their
     *  modal up by id to hook its show/hide lifecycle. */
    dialogId?: string;
    /** Sizing hint mapped to a max-width in menu.css. */
    size?: 'md' | 'lg' | 'xl';
    /** Give the shell a *definite* full height instead of shrinking to content.
     *  Required by panels whose body scrolls internally via a percentage-height
     *  (`h-100`) chain — that chain only resolves against a definite-height
     *  ancestor, which `max-height` alone is not. See `.forge-menu-modal--fill`
     *  in menu.css. */
    fill?: boolean;
    /** Extra controls rendered in the header, left of the close button. */
    headerExtras?: ReactNode;
    /** Footer content (e.g. a Save button); omitted when absent. */
    footer?: ReactNode;
    /** When several modals are stacked only the top one should react to Esc,
     *  matching stock (Esc dismisses the front-most Bootstrap modal only). */
    closeOnEsc?: boolean;
    children: ReactNode;
}

export default function MenuModal({
    title,
    onClose,
    dialogId,
    size = 'lg',
    fill = false,
    headerExtras,
    footer,
    closeOnEsc = true,
    children,
}: MenuModalProps) {
    // Close on Esc, matching the stock modals' keyboard behaviour.
    useEffect(() => {
        if (!closeOnEsc) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose, closeOnEsc]);

    return createPortal(
        <div className="forge-menu-backdrop" onPointerDown={onClose}>
            <div
                id={dialogId}
                className={`forged panel panel--modal forge-menu-modal forge-menu-modal--${size}${fill ? ' forge-menu-modal--fill' : ''}`}
                // The editors are Bootstrap; the scoped stylesheet
                // (forge-modal-bootstrap.scss) carries Bootstrap's dark theme,
                // which this attribute activates as the base the forge --bs-*
                // overrides recolour.
                data-bs-theme="dark"
                // Clicks inside the dialog must not fall through to the backdrop.
                onPointerDown={(e) => e.stopPropagation()}
            >
                <div className="panel__head">
                    <span className="orn" />
                    <span className="panel__title">{title}</span>
                    <div className="forge-menu-modal__head-actions">
                        {headerExtras}
                        <button
                            type="button"
                            className="forge-menu-modal__close"
                            onClick={onClose}
                            title="Zamknij"
                        >
                            &times;
                        </button>
                    </div>
                </div>
                <div className="panel__body forge-menu-modal__body">{children}</div>
                {footer && <div className="forge-menu-modal__footer">{footer}</div>}
            </div>
        </div>,
        document.body,
    );
}
