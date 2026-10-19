import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog } from './Dialog';
import { Button, type ButtonProps } from './controls';

/**
 * In-app replacements for the browser's confirm() and alert(). The native
 * ones freeze the whole page (game output, timers, socket handlers) until
 * dismissed; these are the shared Dialog, awaited instead.
 *
 * Mounted in its own root on <body>, above every page-level window, so they
 * can be called from anywhere — a click handler, a hook, plain TS.
 */

export interface ConfirmOptions {
    title?: string;
    message: string;
    /** Label of the confirming button. Defaults to "OK". */
    confirmLabel?: string;
    cancelLabel?: string;
    /** The confirming button is red (deletes, overwrites). */
    danger?: boolean;
}

export interface AlertOptions {
    title?: string;
    message: string;
}

/** Resolves true when the player confirmed, false when they cancelled or dismissed it. */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    return show<boolean>(resolve => (
        <MessageDialog
            title={options.title ?? 'Potwierdź'}
            message={options.message}
            onClose={() => resolve(false)}
            buttons={[
                { label: options.cancelLabel ?? 'Anuluj', variant: 'secondary', onClick: () => resolve(false) },
                { label: options.confirmLabel ?? 'OK', variant: options.danger ? 'danger' : 'solid', onClick: () => resolve(true), focus: true },
            ]}
        />
    ));
}

/** Resolves once the player has closed it. */
export function alertDialog(options: AlertOptions | string): Promise<void> {
    const { title, message } = typeof options === 'string' ? { title: undefined, message: options } : options;
    return show<void>(resolve => (
        <MessageDialog
            title={title ?? 'Uwaga'}
            message={message}
            onClose={() => resolve()}
            buttons={[{ label: 'OK', variant: 'solid', onClick: () => resolve(), focus: true }]}
        />
    ));
}

function show<T>(render: (resolve: (value: T) => void) => ReactNode): Promise<T> {
    const host = document.createElement('div');
    host.className = 'popup-confirm-host';
    document.body.appendChild(host);
    const root = createRoot(host);
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    return new Promise<T>(resolve => {
        let done = false;
        const finish = (value: T) => {
            if (done) return;
            done = true;
            root.unmount();
            host.remove();
            if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
            resolve(value);
        };
        root.render(render(finish));
    });
}

interface MessageButton {
    label: string;
    variant: ButtonProps['variant'];
    onClick: () => void;
    focus?: boolean;
}

function MessageDialog({ title, message, onClose, buttons }: {
    title: string;
    message: string;
    onClose: () => void;
    buttons: MessageButton[];
}) {
    return (
        <Dialog
            title={title}
            onClose={onClose}
            size="sm"
            footer={buttons.map(button => (
                <Button key={button.label} variant={button.variant} onClick={button.onClick} autoFocus={button.focus}>
                    {button.label}
                </Button>
            ))}
        >
            <p className="popup-confirm-message">{message}</p>
        </Dialog>
    );
}
