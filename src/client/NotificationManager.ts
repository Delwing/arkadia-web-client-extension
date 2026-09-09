import { getBehaviorSettings } from '@modules/core/settings';
import { sendPush } from '@modules/push/pushClient';

export default class NotificationManager {
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
     * Send the alert onward to the player's other devices.
     *
     * By default this happens regardless of whether the tab is focused: a tab
     * left open on a second monitor while its owner is in the kitchen is still
     * an unwatched client, and page visibility cannot tell the difference.
     * `pushOnlyWhenHidden` restores the stricter behaviour for anyone who does
     * not want their phone buzzing while they are plainly at the desk.
     */
    private async pushToOtherDevices(message: string) {
        const onlyWhenHidden = getBehaviorSettings().pushOnlyWhenHidden;
        if (
            onlyWhenHidden &&
            typeof document !== 'undefined' &&
            document.visibilityState !== 'hidden'
        ) {
            return;
        }

        // Never throws: push is an accessory, and a Worker that is down must
        // not surface mid-fight. sendPush no-ops when this browser holds no
        // push account, and applies the shared rate limit — which lives there
        // because a user's `push` trigger macro reaches the same phone.
        await sendPush({ title: 'Arkadia', body: message });
    }
}
