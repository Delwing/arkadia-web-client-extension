import type { ReactNode, Ref } from "react";

interface AppModalShellProps {
    id: string;
    title: string;
    /** Extra classes on `.app-modal` (e.g. `app-modal--settings`). */
    modalClassName?: string;
    /** Extra classes on `.app-modal__dialog` (size and fill modifiers). */
    dialogClassName?: string;
    /** Extra classes on `.app-modal__body`. */
    bodyClassName?: string;
    /** Buttons in the header, before the close button. */
    headerActions?: ReactNode;
    /** A header slot for a panel that portals its toolbar into it (Klawisze). */
    headerSlot?: { id: string; ref: Ref<HTMLDivElement> };
    footer?: ReactNode;
    children: ReactNode;
}

/**
 * The frame of a page-level window (Ustawienia, Klawisze, Miejsca…), opened by id
 * through {@link AppModal}. Renders the same markup index.html used to hold, so the
 * controller, the styles (style.css "app-modal") and the tests see no difference.
 *
 * The controller toggles `hidden` and `z-index` on the element itself; React sets
 * `hidden` only once, at mount, and never touches either again.
 */
export function AppModalShell({
    id,
    title,
    modalClassName,
    dialogClassName,
    bodyClassName,
    headerActions,
    headerSlot,
    footer,
    children,
}: AppModalShellProps) {
    const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" ");
    return (
        <div id={id} className={join("app-modal", modalClassName)} hidden>
            <div className={join("app-modal__dialog", dialogClassName)} tabIndex={-1}>
                <div className="app-modal__header">
                    <h2 className="app-modal__title">{title}</h2>
                    {headerSlot && <div id={headerSlot.id} className="app-modal__header-slot" ref={headerSlot.ref} />}
                    {headerActions}
                    <button type="button" className="app-modal__close" data-modal-dismiss="" title="Zamknij">&times;</button>
                </div>
                <div className={join("app-modal__body", bodyClassName)}>
                    {children}
                </div>
                {footer && <div className="app-modal__footer">{footer}</div>}
            </div>
        </div>
    );
}
