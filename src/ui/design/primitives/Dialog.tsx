import type { ReactNode } from "react";
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
    return (
        <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
            <RadixDialog.Portal>
                <div className="ark-root" data-ark-theme={theme}>
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

/** Close control with the Esc hint spelled out next to it. */
export function DialogClose({ title = "Zamknij  Esc" }: { title?: string }) {
    return (
        <RadixDialog.Close className="ark-dialog-close" title={title}>
            <Kbd bare>Esc</Kbd>
            <Icon name="close" />
        </RadixDialog.Close>
    );
}
