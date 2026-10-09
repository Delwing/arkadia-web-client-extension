/**
 * Local, on-this-machine notifications.
 *
 * Deliberately does NOT forward anything to paired devices. Push is opt-in per
 * alert: the player binds a `push` macro to the trigger or event they actually
 * care about (see SUPPORTED_EVENTS in scripts/userTriggers.ts). Fanning every
 * internal `notify()` out to a phone meant chatty, low-stakes messages — a full
 * hp timer, a walk step — buzzing a pocket, which is not what anyone paired a
 * device for.
 */
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
        if (typeof Notification === 'undefined') {
            return;
        }
        if (Notification.permission !== 'granted') {
            return;
        }
        if ('serviceWorker' in navigator && navigator.serviceWorker) {
            navigator.serviceWorker.ready
                // No tag: every alert is its own notification. A shared tag made
                // a repeat replace the one still in macOS Notification Center
                // without a new banner, `renotify` notwithstanding.
                .then((reg) => reg.showNotification(message))
                .catch(() => {});
        } else {
            new Notification(message);
        }
    }
}
