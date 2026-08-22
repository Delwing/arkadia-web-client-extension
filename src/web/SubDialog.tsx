import { useEffect, type ReactNode } from "react";

/**
 * A dialog rendered *inline*, over whichever modal hosts it.
 *
 * Panels under `src/web/options` and `src/web/uiSettings` are mounted inside
 * stock's Bootstrap-driven modals (`#scripts-modal`, `#binds-modal`,
 * `#export-import-modal`, `#ui-settings-modal`) and, under forge, inside
 * `.forge-menu-modal`. A react-bootstrap `<Modal>` cannot be used for their
 * sub-dialogs: it portals to `document.body`, and the two focus managers then
 * fight over the portaled node — Bootstrap's FocusTrap pulls focus back into
 * the host dialog while react-overlays' `enforceFocus` pulls it back to the
 * child. The exchange repeats thousands of times a second: it pegs the CPU
 * until the page stops responding, and focus sticks on the child's close
 * button so its inputs cannot be typed into. Closing the host modal from under
 * a portaled child also leaves the child's backdrop on `document.body`,
 * swallowing every click on the page.
 *
 * Rendering inline sidesteps all of it — no portal, no second focus trap, and
 * the dialog's lifetime is tied to its host.
 */
export interface SubDialogProps {
    title: string;
    onClose: () => void;
    children: ReactNode;
    footer?: ReactNode;
    size?: 'sm' | 'lg';
    /** Cap the body height and scroll inside it. On by default. */
    scrollable?: boolean;
    /** Backdrop clicks, Escape and the header's × close the dialog. On by default. */
    dismissible?: boolean;
}

function SubDialog({
    title,
    onClose,
    children,
    footer,
    size,
    scrollable = true,
    dismissible = true,
}: SubDialogProps) {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // Keep Escape from reaching the Bootstrap-driven host modal, which
            // would otherwise close the whole window instead of this dialog.
            event.stopPropagation();
            if (dismissible) onClose();
        };
        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [dismissible, onClose]);

    const dialogClasses = [
        'modal-dialog',
        size ? `modal-${size}` : '',
        'modal-dialog-centered',
        scrollable ? 'modal-dialog-scrollable' : '',
    ].filter(Boolean).join(' ');

    return (
        <div
            className="modal show d-block"
            style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}
            onClick={(e) => {
                if (dismissible && e.target === e.currentTarget) onClose();
            }}
        >
            <div className={dialogClasses} style={{ zIndex: 1061 }}>
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">{title}</h5>
                        {dismissible && <button type="button" className="btn-close" onClick={onClose} />}
                    </div>
                    <div className="modal-body">{children}</div>
                    {footer && <div className="modal-footer">{footer}</div>}
                </div>
            </div>
        </div>
    );
}

export default SubDialog;
