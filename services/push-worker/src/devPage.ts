/**
 * Self-contained test page, served only when DEV_TEST_PAGE is set.
 *
 * It authenticates exactly as the real client will — minting a credential on
 * first use and storing it locally — so this exercises the production auth path
 * rather than bypassing it.
 *
 * Served by the Worker itself rather than by the Vite dev server so that the
 * page, the service worker and the API are all one origin: no CORS, no
 * cross-origin service worker scope problems, and a single tunnel hostname.
 *
 * Never reachable from a deployed Worker — see the `dev` environment block in
 * wrangler.jsonc.
 */

export const DEV_SW_JS = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    // The browser has already decrypted the RFC 8291 body by the time this
    // fires. event.data is null only for a payload-less push, which this
    // Worker no longer sends — the fallback is kept because a push service may
    // still deliver one after a subscription change.
    var title = 'Arkadia';
    var body = 'Push delivered (no payload).';
    var url = '/dev';
    if (event.data) {
        try {
            var parsed = event.data.json();
            title = parsed.title || title;
            body = parsed.body || body;
            url = parsed.url || url;
        } catch (err) {
            body = event.data.text();
        }
    }
    event.waitUntil(self.registration.showNotification(title, {
        body: body,
        tag: 'arkadia-dev',
        renotify: true,
        data: { url: url }
    }));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    var target = (event.notification.data && event.notification.data.url) || '/dev';
    event.waitUntil(self.clients.openWindow(target));
});
`;

export const DEV_PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Arkadia push test</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; margin: 0; padding: 1.5rem;
         background: #17140f; color: #f0ebe2; }
  h1 { font-size: 1.3rem; margin: 0 0 1rem; }
  button { font: inherit; width: 100%; padding: 0.85rem 1rem; margin-bottom: 0.75rem;
           background: #f0a24a; color: #17140f; border: 0; border-radius: 4px;
           font-weight: 600; }
  button.secondary { background: #1f1b15; color: #f0ebe2; border: 1px solid #362f24; }
  button:disabled { opacity: 0.45; }
  #log { font: 13px/1.5 ui-monospace, monospace; white-space: pre-wrap;
         background: #1f1b15; border: 1px solid #362f24; padding: 0.75rem;
         border-radius: 4px; word-break: break-word; }
  .step { color: #8b7f6d; font-size: 0.8rem; text-transform: uppercase;
          letter-spacing: 0.08em; margin: 1.25rem 0 0.5rem; }
  #qr { display: none; background: #fff; padding: 1rem; border-radius: 4px;
        margin-bottom: 0.75rem; text-align: center; }
  #qr img, #qr canvas { display: block; margin: 0 auto; }
  #qrHint { color: #8b7f6d; font-size: 0.85rem; margin-bottom: 0.75rem;
            display: none; text-align: center; }
  #account { color: #8b7f6d; font: 12px/1.5 ui-monospace, monospace;
             margin-bottom: 0.75rem; }
</style>
</head>
<body>
<h1>Arkadia push test</h1>
<div id="account">no account yet</div>

<div class="step">1 &mdash; receive alerts on this device</div>
<button id="subscribe">Enable notifications</button>

<div class="step">2 &mdash; send yourself one</div>
<button id="notify" disabled>Send test push</button>

<div class="step">3 &mdash; add your phone</div>
<button id="pair" class="secondary">Show pairing QR</button>
<div id="qr"></div>
<div id="qrHint"></div>

<div class="step">log</div>
<div id="log">ready</div>

<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script>
var logEl = document.getElementById('log');
var notifyBtn = document.getElementById('notify');
var accountEl = document.getElementById('account');
var qrEl = document.getElementById('qr');
var qrHint = document.getElementById('qrHint');
var STORAGE_KEY = 'arkadia.push.dev.credentials';

function log(message) {
    logEl.textContent = new Date().toLocaleTimeString() + '  ' + message + '\\n' + logEl.textContent;
}

function loadCredentials() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (err) {
        return null;
    }
}

function saveCredentials(credentials) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials));
    render();
}

function render() {
    var credentials = loadCredentials();
    notifyBtn.disabled = !credentials;
    accountEl.textContent = credentials ? 'account ' + credentials.pushId : 'no account yet';
}

function authHeaders() {
    var credentials = loadCredentials();
    if (!credentials) return {};
    return { authorization: 'Bearer ' + credentials.pushId + '.' + credentials.pushSecret };
}

function merge(base, extra) {
    for (var key in extra) base[key] = extra[key];
    return base;
}

async function postJson(path, body) {
    var response = await fetch(path, {
        method: 'POST',
        headers: merge({ 'content-type': 'application/json' }, authHeaders()),
        body: JSON.stringify(body || {})
    });
    return { status: response.status, ok: response.ok, data: await response.json() };
}

// --- Joining from a scanned QR ---------------------------------------
// The code rides in the fragment, which browsers never send to the server, so
// it only ever reaches the Worker in the claim request below.
async function claimFromHash() {
    var match = /[#&]pair=([A-Za-z0-9]+)/.exec(location.hash);
    if (!match) return;

    // Clear it immediately: the code is single-use, so a refresh must not
    // retry a burned one and report a confusing failure.
    history.replaceState(null, '', location.pathname);

    log('claiming pairing code...');
    var result = await postJson('/push/pair/claim', { code: match[1] });
    if (!result.ok) {
        log('pairing failed: ' + result.data.message);
        return;
    }
    saveCredentials({ pushId: result.data.pushId, pushSecret: result.data.pushSecret });
    log('joined account ' + result.data.pushId + ' - now tap Enable notifications');
}

function toBytes(base64url) {
    var padded = base64url + '==='.slice((base64url.length + 3) % 4);
    var binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

document.getElementById('subscribe').addEventListener('click', async function () {
    try {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            log('ERROR no Push API here (on iOS, add this page to the home screen first)');
            return;
        }

        log('requesting permission...');
        var permission = await Notification.requestPermission();
        log('permission: ' + permission);
        if (permission !== 'granted') return;

        var registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;
        log('service worker ready');

        var keyResponse = await fetch('/dev/vapid-public');
        var keyData = await keyResponse.json();

        var subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: toBytes(keyData.publicKey)
        });
        log('subscribed to ' + new URL(subscription.endpoint).host);

        var payload = subscription.toJSON();
        payload.label = navigator.userAgent.slice(0, 60);

        // No credential yet means the Worker mints one and returns it; with a
        // credential this browser joins the account that already exists.
        var result = await postJson('/push/subscribe', { subscription: payload });
        log('POST /push/subscribe -> ' + result.status + ' devices=' + result.data.devices);

        if (result.data.pushSecret) {
            saveCredentials({ pushId: result.data.pushId, pushSecret: result.data.pushSecret });
            log('minted new account ' + result.data.pushId);
        } else {
            render();
        }
    } catch (err) {
        log('ERROR ' + (err && err.message ? err.message : String(err)));
    }
});

notifyBtn.addEventListener('click', async function () {
    try {
        log('sending...');
        var result = await postJson('/push/notify', {
            title: 'Arkadia',
            body: 'Jestes ciezko ranny'
        });
        log('POST /push/notify -> ' + result.status + ' ' + JSON.stringify(result.data));
    } catch (err) {
        log('ERROR ' + (err && err.message ? err.message : String(err)));
    }
});

document.getElementById('pair').addEventListener('click', async function () {
    try {
        // Unauthenticated is fine here: the Worker mints an account so this
        // device can start pairing without having subscribed to anything.
        var result = await postJson('/push/pair/start', {});
        if (!result.ok) {
            log('POST /push/pair/start -> ' + result.status + ' ' + JSON.stringify(result.data));
            return;
        }
        if (result.data.pushSecret) {
            saveCredentials({ pushId: result.data.pushId, pushSecret: result.data.pushSecret });
            log('minted new account ' + result.data.pushId);
        }

        var target = location.origin + location.pathname + '#pair=' + result.data.code;
        qrEl.innerHTML = '';
        new QRCode(qrEl, {
            text: target,
            width: 220,
            height: 220,
            colorDark: '#17140f',
            colorLight: '#ffffff'
        });
        qrEl.style.display = 'block';
        qrHint.style.display = 'block';
        qrHint.textContent = 'Scan with your phone. Expires in ' +
            Math.round(result.data.expiresInSeconds / 60) + ' minutes, single use.';
        log('pairing QR ready');
    } catch (err) {
        log('ERROR ' + (err && err.message ? err.message : String(err)));
    }
});

render();
claimFromHash();
</script>
</body>
</html>`;
