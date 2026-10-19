import { createRoot } from 'react-dom/client';
import type Client from '@client/Client';
import type { NotificationAction } from '@shared/events/clientEvents.ts';
import { getShellSettings } from '@modules/core/settings';
import { ToastStore } from './toastStore';
import { ToastStack } from './ToastStack';
import { normalizeToastSettings } from './toastSettings';
import './toasts.css';

/**
 * Renders the `notify` toasts into #notification-center, a zero-height sticky
 * strip at the top of the game output's scroll container. The stack inside it
 * is placed against the visible output, so it learns the scrollport's height
 * to reach the bottom corners.
 */
export function mountToasts(container: HTMLElement, outputWrapper: HTMLElement, client: Client): ToastStore {
    const store = new ToastStore(() => normalizeToastSettings(getShellSettings()));

    const measure = () => container.style.setProperty('--toast-viewport-h', `${outputWrapper.clientHeight}px`);
    measure();
    new ResizeObserver(measure).observe(outputWrapper);

    client.on('notify', (payload) => {
        if (!payload) return;
        store.show(payload);
        if (payload.system && payload.text) {
            client.notify(payload.title ? `${payload.title}: ${payload.text}` : payload.text);
        }
    });
    client.on('notify.dismiss', (payload) => {
        if (payload?.key) store.dismissKey(payload.key);
    });

    const runAction = (action: NotificationAction) => {
        try {
            action.onClick?.();
        } catch (error) {
            console.error('Notification action failed', error);
        }
        if (action.command) client.sendCommand(action.command);
    };

    createRoot(container).render(<ToastStack store={store} runAction={runAction} />);
    return store;
}
