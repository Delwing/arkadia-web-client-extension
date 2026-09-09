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

        // Never throws: push is an accessory, and a Worker that is down must
        // not surface mid-fight. sendPush no-ops when this browser holds no
        // push account, and applies the shared rate limit — which lives there
        // because a user's `push` trigger macro reaches the same phone.
        await sendPush({ title: 'Arkadia', body: message });
    }
}
