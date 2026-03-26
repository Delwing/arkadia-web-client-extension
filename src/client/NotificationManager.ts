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
        if (Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker) {
                navigator.serviceWorker.ready
                    .then((reg) => reg.showNotification(message))
                    .catch(() => {});
            } else {
                new Notification(message);
            }
        }
    }
}
