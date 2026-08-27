# Session proxy spike

Answers one question before anyone designs a resume protocol around it:

> Does a Durable Object keep a telnet connection to Arkadia alive while no client is
> attached, on the **free** Workers plan?

If yes, a stateful proxy fixes the mobile disconnects for every platform — the socket
lives here, so a frozen browser tab costs the player nothing but a replay. If no, the
whole approach is dead and the answer is an Android app or a VPS instead.

Nothing in the web client changes for this test, and no game account is needed: Arkadia
sends its login banner and then sits at the prompt, which is enough to watch a socket
stay open.

## How it measures

An alarm writes a heartbeat to Durable Object storage every 30s recording whether the
socket is still in memory. That makes eviction unmistakable:

| What you see in `/status` | What happened |
| --- | --- |
| heartbeats continue, `up: true` | the object stayed resident — the design works |
| heartbeats continue, `up: false`, `closed` set | the object lived, but Arkadia hung up (idle timeout) |
| heartbeats stop, then resume with `up: false` and no `closed` | **evicted** — memory wiped, socket lost |
| heartbeats stop and never resume | the object was evicted and the alarm never rescheduled |

The third row is the failure we care about. It is what the docs warn about when they say
in-memory state must be reconstructible from storage.

## Deploy

```bash
cd session-proxy
yarn install
npx wrangler deploy
```

The DO class must be registered with `new_sqlite_classes` (see `wrangler.jsonc`) —
SQLite-backed Durable Objects are the only kind the free plan allows.

## Run the test

1. Attach a client and watch the login banner arrive:

   ```bash
   npx wscat -c "wss://arkadia-session-proxy.<subdomain>.workers.dev/?session=test1"
   ```

2. Kill it with Ctrl-C. That is the frozen-tab case: the browser is gone, the telnet
   connection should not be.

3. Wait. Check at intervals — 2 minutes, 10, 30:

   ```bash
   curl -s "https://arkadia-session-proxy.<subdomain>.workers.dev/status?session=test1" | jq
   ```

   `socketInMemory` and the heartbeat trail are the answer. Watch for gaps in `at`.

4. Reattach with the same session id and confirm the replay arrives:

   ```bash
   npx wscat -c "wss://arkadia-session-proxy.<subdomain>.workers.dev/?session=test1"
   ```

`npx wrangler tail` in another terminal shows the object's own view while you do it.

## Findings so far (local `wrangler dev`)

Local workerd cannot answer the eviction question — that is production behaviour — but it
settled everything else, including two traps that would have cost days later.

**The session mechanic works.** Detaching leaves `socketInMemory: true`; reattaching with
the same id returns *no* banner, proving it reused the live socket rather than dialing a
new one; a 5.5 minute detach held the connection across 20 unbroken heartbeats, and
Arkadia did not drop the idle login prompt in that window. Buffer and replay work: with a
server ticking once a second, a 10 second detach replayed `TICK 3`–`TICK 16` in order on
reattach, nothing lost or duplicated.

**Trap 1: binary frames arrive as a `Blob`.** A server-side WebSocket in a Durable Object
delivers binary frames as `Blob` unless you set `binaryType = 'arraybuffer'`, and
`new Uint8Array(blob)` yields an **empty array** — no throw, no warning. Every write then
"succeeds" with zero bytes: `write()` resolves, the socket reports no error, and nothing
whatsoever reaches the game. Note that `src/web/hostProxy/proxyWorker.js` does
`new Uint8Array(event.data)` with no binaryType and works in production, so the default
differs between a plain Worker and a Durable Object — or between runtime versions. Worth
pinning explicitly there too.

**Trap 2: queued writes must copy their bytes.** `event.data`'s buffer is only valid for
the duration of the listener. Queue a view onto it and the deferred write sends a
detached, zero-length chunk — the same silent failure as above.

**Non-trap, worth knowing:** the pattern `proxyWorker.js` uses — hold a writer, `await
writer.write()` inside the `message` listener — is fine. The earlier hang here was Trap 1
wearing a disguise.

## Consequence for the client: event time, not delivery time

Replay breaks an assumption the client currently makes. Output that arrives on reattach
describes things that happened *minutes ago*, so anything stamping `Date.now()` while
processing a line records when the browser woke up rather than when the event happened.
That is 60 `Date.now()` calls across 21 scripts today — counters, timers, `postepy`
tracking — and they would all quietly skew by the length of the detach.

The seam already half exists: `playback.incomingData` carries `{ timestamp }` for the
recorder, and `MudClient.output()` accepts one. But `processIncomingData()` takes
`_options` and ignores it, so the timestamp never reaches trigger handlers.

The design consequence is concrete: **the proxy must timestamp buffered chunks, so the
replay stream can no longer be raw bytes.** Replayed data needs framing that carries the
time each chunk arrived at the proxy, the client needs to thread that through
`processIncomingData` to triggers, and scripts need an injected "now" rather than
`Date.now()`. Worth deciding before the protocol is fixed, because retrofitting framing
onto a deployed proxy is a breaking change.

## What this spike deliberately leaves out

- **Session ids are unauthenticated.** Anyone with the id attaches to a logged-in
  character. A real version needs high-entropy ids treated as credentials.
- **No upstream allowlist.** `?host=` accepts anything, which is an open TCP relay.
  `helper/server/telnet.go` pins the host for exactly this reason; a real version must
  too, before it is exposed to anyone.
- Free-plan daily limits are not measured here. If the object *does* stay resident, the
  next question is what a session costs against the free allowance, since duration is
  charged for as long as the object is in memory.
