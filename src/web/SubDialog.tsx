import type { ReactNode } from "react";
import { Dialog } from "@web-ui/primitives/Dialog.tsx";

/**
 * A dialog rendered *inline*, over whichever modal hosts it — now a thin
 * wrapper over the shared Dialog, kept so its existing callers stay as they
 * are.
 *
 * Panels under `src/web/options` and `src/web/uiSettings` are mounted inside
 * stock's page-level windows (`#scripts-modal`, `#binds-modal`,
 * `#export-import-modal`, `#settings-modal`) and, under forge, inside
 * `.forge-menu-modal`. A portaled dialog there makes the two focus managers
 * fight (CPU pegged, inputs untypeable) and can leave a stray backdrop behind
 * — see Dialog.tsx for why it renders inline.
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

function SubDialog({ size, ...rest }: SubDialogProps) {
    return <Dialog size={size ?? 'md'} {...rest} />;
}

export default SubDialog;
