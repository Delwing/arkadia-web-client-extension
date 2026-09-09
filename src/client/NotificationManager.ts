import { sendPush } from '@modules/push/pushClient';

/**
 * How long to wait between pushes to other devices.
 *
 * An AFK player being hit takes damage repeatedly, and `notify()` fires on each
 * drop. Without this, one fight becomes dozens of pushes: the phone buzzes for
 * a minute straight and the push service sees a burst worth rate-limiting. The
 * local notification is not throttled — it costs nothing and collapses by tag.
 */
const PUSH_COOLDOWN_MS = 60_000;

export default class NotificationManager {
    private lastPushAt = 0;

    enableNotifications() {
        if (typeof Notification === 'undefined') {
            return;
        }
        if ('serviceWorker' in navigator && navigator.serviceWorker) {
            navigator.serviceWorker.register('sw.js').catch(() => {});
        }
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    notify(message: string) {
        this.showLocally(message);
        void this.pushToOtherDevices(message);
    }

    private showLocally(message: string) {
        if (typeof Notification === 'undefined') {
            return;
        }
        if (Notification.permission !== 'granted') {
            return;
        }
        if ('serviceWorker' in navigator && navigator.serviceWorker) {
            navigator.serviceWorker.ready
                // Same tag the push handler uses, so a local notification and a
                // push carrying the same alert collapse into one on a device
                // that is both looking at the game and subscribed.
                .then((reg) => reg.showNotification(message, { tag: 'arkadia-alert' }))
                .catch(() => {});
        } else {
            new Notification(message);
        }
    }

    /**
     * Send the alert onward only when nobody is looking at this tab.
     *
     * That is the whole point of the feature — if the client is on screen the
     * player has already seen the message, and a phone buzzing in their pocket
     * at the same moment is noise.
     */
    private async pushToOtherDevices(message: string) {
        if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
            return;
        }

        const now = Date.now();
        if (now - this.lastPushAt < PUSH_COOLDOWN_MS) {
            return;
        }
        // Recorded before awaiting, so a burst of calls in the same tick cannot
        // all slip past the check together.
        this.lastPushAt = now;

        // Never throws: push is an accessory, and a Worker that is down must
        // not surface mid-fight. sendPush no-ops when this browser holds no
        // push account.
        await sendPush({ title: 'Arkadia', body: message });
    }
}
