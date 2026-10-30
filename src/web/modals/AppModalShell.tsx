import { useLayoutEffect, useRef, useState, type ReactNode, type Ref } from "react";
import { flushSync } from "react-dom";
import { MODAL_EVENT } from "./appModal";

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
 *
 * The content (`children`) mounts the first time the window is needed
 * ({@link MODAL_EVENT.prepare}, before it opens) and then stays mounted, so a
 * window keeps its state between openings. Mounting it all at start-up made the
 * first paint wait for every window (Ustawienia alone is most of the page).
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
    const ref = useRef<HTMLDivElement>(null);
    const [prepared, setPrepared] = useState(false);

    useLayoutEffect(() => {
        if (prepared) return;
        const element = ref.current!;
        // Synchronously, so the content and its effects (its own `show`
        // listeners among them) are in place before the window opens.
        const prepare = () => flushSync(() => setPrepared(true));
        element.addEventListener(MODAL_EVENT.prepare, prepare);
        return () => element.removeEventListener(MODAL_EVENT.prepare, prepare);
    }, [prepared]);

    return (
        <div id={id} className={join("app-modal", modalClassName)} hidden ref={ref}>
            <div className={join("app-modal__dialog", dialogClassName)} tabIndex={-1}>
                <div className="app-modal__header">
                    <h2 className="app-modal__title">{title}</h2>
                    {headerSlot && <div id={headerSlot.id} className="app-modal__header-slot" ref={headerSlot.ref} />}
                    {headerActions}
                    <button type="button" className="app-modal__close" data-modal-dismiss="" title="Zamknij">&times;</button>
                </div>
                <div className={join("app-modal__body", bodyClassName)}>
                    {prepared && children}
                </div>
                {footer && <div className="app-modal__footer">{footer}</div>}
            </div>
        </div>
    );
}
