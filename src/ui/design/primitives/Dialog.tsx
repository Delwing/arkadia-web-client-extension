import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { Dialog as RadixDialog } from "radix-ui";
import { cx } from "../cx";
import { Icon } from "./Icon";
import { Kbd } from "./Kbd";

export interface DialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /**
     * `full` is the large working surface (the log viewer); `sm`/`md` size to
     * their content for confirmations and small forms.
     */
    size?: "full" | "md" | "sm";
    /** Theme to render the dialog subtree under; inherits when omitted. */
    theme?: string;
    className?: string;
    children: ReactNode;
    /** Escape and outside-click both close by default. */
    dismissible?: boolean;
}

/**
 * How deep in a stack of dialogs this one sits.
 *
 * Radix manages focus and dismissal for nested layers but not their painting
 * order, and every dialog portals to `document.body` at the same z-index —
 * so a dialog opened from a dialog had its scrim land *under* the one it was
 * covering. The depth turns into `--ark-dialog-level`, which `dialog.css`
 * adds onto both z-indexes. Nesting is counted rather than declared: a call
 * site that has to pass its own depth eventually passes the wrong one.
 */
const DialogDepth = createContext(0);

/**
 * Modal shell. Radix owns focus trapping, focus restore, scroll locking and
 * the dismiss behaviour — the things hand-rolled modals in this codebase have
 * historically got wrong.
 *
 * The content is portaled to `document.body`, so it carries its own
 * `.ark-root` + theme attribute: outside the app subtree it would otherwise
 * inherit no tokens at all.
 */
export function Dialog({
    open,
    onOpenChange,
    size = "full",
    theme,
    className,
    children,
    dismissible = true,
}: DialogProps) {
    const depth = useContext(DialogDepth) + 1;
    return (
        <DialogDepth.Provider value={depth}>
            <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
                <RadixDialog.Portal>
                    <div
                        className="ark-root"
                        data-ark-theme={theme}
                        style={{ "--ark-dialog-level": depth } as CSSProperties}
                    >
                        <RadixDialog.Overlay className="ark-dialog-overlay" />
                        <RadixDialog.Content
                            className={cx(
                                "ark-dialog-content",
                                size !== "full" && "ark-dialog-content--auto",
                                size !== "full" && `ark-dialog-content--${size}`,
                                className,
                            )}
                            onEscapeKeyDown={dismissible ? undefined : (event) => event.preventDefault()}
                            onPointerDownOutside={dismissible ? undefined : (event) => event.preventDefault()}
                        >
                            {children}
                        </RadixDialog.Content>
                    </div>
                </RadixDialog.Portal>
            </RadixDialog.Root>
        </DialogDepth.Provider>
    );
}

export function DialogHeader({ compact, children }: { compact?: boolean; children: ReactNode }) {
    return <div className={cx("ark-dialog-header", compact && "ark-dialog-header--sm")}>{children}</div>;
}

export function DialogTitle({ children }: { children: ReactNode }) {
    return <RadixDialog.Title className="ark-dialog-title">{children}</RadixDialog.Title>;
}

export function DialogSubtitle({ children }: { children: ReactNode }) {
    return <div className="ark-dialog-subtitle">{children}</div>;
}

/**
 * The scrolling middle of a dialog. `padded` is for prose and forms; the
 * default is flush, because a working surface (the log viewer) brings its own
 * internal layout right up to the edges.
 */
export function DialogBody({
    padded,
    className,
    children,
}: {
    padded?: boolean;
    className?: string;
    children: ReactNode;
}) {
    return <div className={cx("ark-dialog-body", padded && "ark-dialog-body--padded", className)}>{children}</div>;
}

export function DialogFooter({ children }: { children: ReactNode }) {
    return <div className="ark-dialog-footer">{children}</div>;
}

/**
 * Close control with the Esc hint spelled out next to it.
 *
 * `data-testid="dialog-close"` is the project's convention for a bare "x" that
 * has no text to aim at — see `e2e/support/dialogs.ts`, whose `dialogClose()`
 * helper every spec goes through.
 */
export function DialogClose({ title = "Zamknij  Esc" }: { title?: string }) {
    return (
        <RadixDialog.Close className="ark-dialog-close" title={title} data-testid="dialog-close">
            <Kbd bare>Esc</Kbd>
            <Icon name="close" />
        </RadixDialog.Close>
    );
}
