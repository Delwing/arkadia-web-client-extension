# Arkadia push Worker

Delivers Web Push alerts to a player's phone when something happens in game and
nobody is looking at the client — the canonical case being `hpAlert.ts` firing
while the tab is hidden.

Standard Web Push, no Firebase Cloud Messaging and no identity provider at all:
one VAPID keypair, subscriptions in KV, payloads encrypted here, and a bearer
credential the Worker mints on first subscribe.

## Identity, and why there is no Firebase here

The only question this Worker has to answer is *"does this caller own these
subscriptions"*. A 256-bit secret answers it completely.

An identity provider would additionally answer "which human is this", which
nothing here asks — and it would make push unavailable to anyone who has not
signed in, which is optional in this client. It would also cost RS256 JWT
verification, x509 cert fetching and cache plumbing, for no security the secret
does not already provide.

So: `POST /push/subscribe` with no credential mints an account — a random
`pushId` and `pushSecret` — and returns it once. Every other route wants
`Authorization: Bearer <pushId>.<pushSecret>`. Only the SHA-256 of the secret is
stored, so a leaked KV dump cannot send anything.

In the real client this credential can also ride along in the existing settings
sync, making pairing invisible for users who have it on — but nothing here
depends on that.

### Pairing is a QR, and never typing

The desktop shows a QR; the phone scans it. That direction is forced by
hardware — phones have cameras, desktops do not — which is why
`POST /push/pair/start` works **without** a credential: the desktop must be able
to start pairing as its first action, before it has subscribed to anything, and
even if it denied notification permission outright. Called with a credential it
shares the existing account instead of minting a second one.

Two deliberate choices in what the QR encodes:

- **A short-lived claim code, not the credential.** A photographed QR holding
  the raw secret would be permanent access. A code expires in five minutes and
  dies on first use.
- **The code sits in the URL fragment** (`/dev#pair=CODE`), which browsers never
  transmit. The code therefore reaches the Worker only inside the POST that
  redeems it — never in a request line or an access log.

The scanning device claims the code on load and immediately clears the fragment,
so a refresh cannot retry a burned code and report a confusing failure. It then
starts receiving straight away — scanning the QR *is* the decision to receive on
that device, so asking again afterwards would be a step carrying no information.

The browser's permission prompt is the one interaction that cannot be removed,
since it requires a real user decision. A pairing scan is the best moment to
spend it: the player just initiated that page load themselves.

## Why this is not part of `worker/`

`worker/README.md` already argues that the AI Worker and the user-deployed
`proxyWorker.js` are separate deliberately — different owners, different trust
models, different bindings. The same test separates this one from the AI Worker,
which shares our owner but nothing else:

| | `worker/` (AI assistant) | `push-worker/` (this) |
|---|---|---|
| Holds | pooled LLM API keys | VAPID private key, account → endpoint map |
| Auth | anonymous device id + Turnstile + daily quota | per-account bearer secret |
| Data | cached answers, quota counters | user subscriptions (personal data) |
| Shape | long SSE streams | short fan-out, per-subscription crypto |

The decisive argument is `secrets.required`. A name listed there must exist at
deploy time or `wrangler deploy` fails outright. Had push lived in the AI
Worker, a missing `VAPID_PRIVATE_KEY` would take the assistant down with it —
and a push bug would share the assistant's rollback. Two Workers cost nothing on
the plan; one shared blast radius costs an outage.

What separation does **not** buy, to be clear: the KV write allowance is
account-wide, so a second namespace gains nothing there. The delivery path is
kept write-free for that reason, not because it has a budget of its own.

### Shared conventions, not shared code

`config.ts` and `http.ts` are deliberate copies of their AI Worker equivalents
rather than a shared module. They are ~60 lines, and extracting them would
recreate exactly the coupling this split exists to remove. Keep them reading
alike; do not make them import each other.

## Setup

### 1. Install

```bash
cd push-worker
yarn install
```

### 2. Create the KV namespace

```bash
npx wrangler kv namespace create PUSH_KV
```

Paste the printed id into `kv_namespaces[0].id` in `wrangler.jsonc`.

### 3. Generate the VAPID keypair

One ECDSA P-256 keypair, generated **once**:

```bash
npx web-push generate-vapid-keys
```

The private half is stored as **JWK JSON**, not as the raw base64url that
`web-push` prints, so the Worker can `importKey('jwk', ...)` with no format
conversion. The public half is derived from the JWK's `x`/`y` at runtime, so
there is no second secret to keep in step.

> **Never rotate this keypair.** The public half is baked into every browser's
> push subscription. Replacing it silently invalidates all of them — no error on
> any side — until every user re-subscribes by hand. Back the JWK up somewhere
> that is not only Cloudflare.

### 4. Set the secret

```bash
npx wrangler secret put VAPID_PRIVATE_KEY   # paste the JWK JSON
```

Do this **before** the first deploy, or `wrangler deploy` fails with "required
secrets have not been set".

### 5. Deploy

```bash
npx wrangler deploy
```

`GET /health` reports whether each binding actually arrived:

```json
{ "ok": true, "vapid": "configured", "kv": "bound", "testPage": false }
```

Both `missing` states fail silently at runtime rather than at deploy time, which
is why the deploy workflow smoke-checks this endpoint.

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| `GET /health` | none | binding readiness |
| `POST /push/subscribe` | optional | register this browser; mints an account when unauthenticated |
| `POST /push/unsubscribe` | bearer | drop one subscription by endpoint |
| `POST /push/notify` | bearer | fan out an alert to the caller's own devices |
| `POST /push/pair/start` | optional | mint a short single-use code; mints an account too when unauthenticated |
| `POST /push/pair/claim` | none | redeem a code for the account's credential |

`/push/subscribe`, `/push/pair/start` and `/push/pair/claim` are the ways in, so
none can require a credential the caller does not have yet. `/push/notify` and
`/push/unsubscribe` are 401 without one.

## Testing on a real phone

The delivery chain can be exercised end to end before auth exists: subscribe →
store → encrypt → sign → deliver → display, with the message text carried in an
RFC 8291 encrypted payload.

`wrangler dev` reads secrets from `.dev.vars` (gitignored):

```
VAPID_PRIVATE_KEY={"kty":"EC","crv":"P-256","x":"...","y":"...","d":"..."}
```

Use the same keypair whose public half sits in `src/modules/push/vapidKey.ts`,
so a subscription made while testing behaves exactly like a real one.

### 1. Run the Worker in dev mode

```bash
cd push-worker
npx wrangler dev --env dev
```

This is the only mode that serves `/dev`. Authentication is unchanged — the
page mints and stores a real credential like any other client.

### 2. Expose it over https

A phone cannot use the Push API over `http://192.168.x.x` — service workers and
`pushManager.subscribe()` require a secure context, and a LAN IP is not one.
`http://localhost` is exempt, but that exemption does not extend to your phone.
So tunnel it:

```bash
cloudflared tunnel --url http://localhost:8787
```

That prints a `https://<random>.trycloudflare.com` URL. No account needed.

### 3. Open `/dev` on the phone

Visit `https://<random>.trycloudflare.com/dev`, tap **Enable notifications**,
accept the permission prompt, then tap **Send test push**. The on-page log shows
each step and the Worker's replies.

To test cross-device pairing, open the same URL on a desktop, hit **Show pairing
QR**, and scan it with the phone. The phone lands on the page already joined to
the desktop's account; one tap on **Enable notifications** and a push sent from
the desktop arrives on the phone.

The notification carries the title and body sent to `/push/notify` — the push
service relays the ciphertext and only the subscribed browser can read it.

> **On iPhone this only works from the home screen.** Safari grants push solely
> to an installed PWA: open the URL, Share → Add to Home Screen, then launch it
> from that icon. Running it in a Safari tab silently offers no `PushManager` at
> all, and the page will say so rather than appearing to hang.

### What "it works" looks like

`/health` should report every binding present:

```json
{ "ok": true, "vapid": "configured", "kv": "bound", "testPage": true }
```

`testPage` is surfaced on purpose: if it is ever `true` on the deployed Worker,
the test harness is exposed and that is an incident.

A successful `/push/notify` returns the per-device HTTP statuses from the push
service, which is what to read when a delivery does not arrive:

```json
{ "ok": true, "delivered": 1, "pruned": 0, "devices": 1, "statuses": [201] }
```

- `201` — accepted.
- `0` — the Worker could not reach the push service at all.
- `404` / `410` — the subscription is dead; it has already been pruned.

## Layout

```
src/
├── index.ts         # routing, CORS, health, the push routes
├── config.ts        # vars/secrets → RuntimeConfig, origin allowlist
├── http.ts          # CORS headers, JSON and error responses
├── vapid.ts         # ES256 request signing (RFC 8292)
├── encrypt.ts       # aes128gcm payload encryption (RFC 8291/8188)
├── push.ts          # delivery, and the delivered/gone/failed mapping
├── subscriptions.ts # the per-user KV document
├── devPage.ts       # the dev-only test page and service worker
└── types.ts         # Env bindings, KV shape, error statuses
```

## A note on the encryption

`encrypt.ts` is verified against the worked example in **RFC 8291 section 5** —
every input pinned, including the ephemeral keypair and salt, so the output is
deterministic and compared byte for byte. The byte layout in that file is not
cosmetic: the `0x02` record delimiter, the big-endian record size, and the order
of the two public keys in the `key_info` string all change the ciphertext. If
you edit it, re-run `test/encrypt.test.ts` — a wrong-but-plausible
implementation produces a body the browser silently fails to decrypt, with no
error visible on either side.
