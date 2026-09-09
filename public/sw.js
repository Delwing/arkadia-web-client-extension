self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

// Web Push. The browser has already decrypted the RFC 8291 payload by the time
// this fires, so `event.data` is the JSON the push Worker encrypted.
//
// `userVisibleOnly: true` is mandatory on subscribe, so every push MUST show a
// notification — a push handled silently eventually costs the subscription.
self.addEventListener('push', (event) => {
    let title = 'Arkadia';
    let body = '';
    let url = '/';

    if (event.data) {
        try {
            const payload = event.data.json();
            title = payload.title || title;
            body = payload.body || body;
            url = payload.url || url;
        } catch (err) {
            // A payload-less push, or one this version does not understand.
            // Showing something generic still satisfies userVisibleOnly.
            body = event.data.text();
        }
    }

    event.waitUntil(
        self.registration.showNotification(title, {
            body,
            icon: '/android-chrome-192x192.png',
            badge: '/favicon-32x32.png',
            // Collapse repeats: an AFK player being hit repeatedly should get a
            // notification that updates, not a stack of dozens.
            tag: 'arkadia-alert',
            renotify: true,
            data: { url },
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = (event.notification.data && event.notification.data.url) || '/';

    // Prefer focusing a tab that already has the client open over opening a
    // second one, which would start a second game session.
    event.waitUntil(
        self.clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                for (const client of clients) {
                    if ('focus' in client) return client.focus();
                }
                if (self.clients.openWindow) return self.clients.openWindow(target);
                return undefined;
            }),
    );
});
