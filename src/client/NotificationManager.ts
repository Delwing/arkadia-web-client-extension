// TypeScript's DOM lib dropped `renotify`, but Chrome still honours it.
type AlertNotificationOptions = NotificationOptions & { renotify?: boolean };

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
                // Shares the tag the push handler uses, so a local notification
                // and a pushed one carrying the same alert collapse into one.
                // `renotify` makes a repeat pop up again; without it Chrome
                // swaps the text in silently while the old one is still shown.
                .then((reg) => {
                    const options: AlertNotificationOptions = { tag: 'arkadia-alert', renotify: true };
                    return reg.showNotification(message, options);
                })
                .catch(() => {});
        } else {
            new Notification(message);
        }
    }
}
