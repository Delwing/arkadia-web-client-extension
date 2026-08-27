# Session proxy

A resumable telnet↔WebSocket bridge. The game connection lives here rather than in the
browser, so a phone that freezes its backgrounded tab loses the WebSocket and **not the
character** — output accumulates and is replayed when the player comes back.

This is the fix for the mobile disconnect reports. Chrome freezes a backgrounded tab
after a few minutes, and a frozen page runs no JavaScript, so nothing client-side can
hold the connection open: not the audio-playback trick (measured — Chrome freezes the
tab anyway and pauses the audio doing it), and not Arkadia's own `utrzymywanie`, which
affected players already have set to `jednostronne`. Since Arkadia has no session
restore, a drop costs a full re-login. Moving the socket off the device is the only
approach that removes the problem rather than reducing it, and it covers iOS too.

## Protocol

**Client → proxy** is raw, unframed bytes, exactly as today. Input needs no timestamp,
and leaving this direction alone keeps the client's send path unchanged.

**Proxy → client** is framed, because raw bytes cannot carry a time:

```
byte 0     frame type: 0x01 data, 0x02 control
bytes 1-8  int64 big-endian, unix milliseconds
bytes 9..  payload
```

Every attach opens with one control frame:

```json
{"type":"attached","sessionAgeMs":11221,"detachedForMs":0,
 "replayedBytes":74,"droppedBytes":0,"resumed":true}
```

`droppedBytes` is non-zero when the player was away long enough to overflow the buffer,
so the client can tell them output was lost instead of silently showing a gap.

### Why the timestamp is not optional

Replayed output describes things that happened minutes ago. Anything stamping
`Date.now()` while processing a line records when the browser woke up — that is 60
`Date.now()` calls across 21 scripts today, covering counters, timers and `postepy`
tracking, all of which would skew by the length of the detach.

The client already has the seam: `playback.incomingData` carries `{ timestamp }` for the
recorder and `MudClient.output()` accepts one. But `processIncomingData()` takes
`_options` and ignores it, so the time never reaches trigger handlers. Wiring that
through is the client-side half of this work.

## Sessions

A session is addressed by an opaque id the client generates and stores. **It is a
credential**: whoever holds it attaches to a logged-in character. Generate it with
`crypto.randomUUID()` or better, keep it per character, and never log it whole — this
end enforces only a 20–200 character length and logs a six-character prefix.

Attaching with an unknown id opens a fresh game connection; a known one resumes.
A second attach to a live session displaces the first, because two clients on one
character interleave input unpredictably.

Abandoned sessions are reaped after `-ttl` (default 10 minutes) — long enough to survive
a frozen tab, short enough not to leave characters idling in the world indefinitely.

## Running it

```bash
go test ./...
go build -o session-proxy .
./session-proxy -addr 127.0.0.1:8080 -ttl 10m
```

Flags: `-addr`, `-upstream-host`, `-upstream-port`, `-buffer` (bytes held for a detached
client, default 512 KiB), `-ttl`, `-dial-timeout`. `GET /health` reports the live session
count.

### Deployment

The client page is HTTPS, so it can only dial `wss://` — this needs a domain and a
certificate. Terminate TLS in front and proxy to the binary; Caddy does both and renews
on its own:

```
proxy.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

Then a systemd unit with `Restart=always`. Note that a restart drops every session, so
deploy when nobody is playing.

On Oracle Cloud, remember the **two** firewalls: opening the port in the OCI security
list is only half of it, since their images also ship iptables rules that drop
everything but SSH.

## Security

The upstream host is pinned by design. This bridge is reachable by anyone who finds it,
so an arbitrary-destination TCP relay would be an open proxy and an SSRF pivot into
whatever the host can reach.

Two things to settle before this serves real players, neither of which is a code
problem:

- **Everyone shares the proxy's IP.** Anti-multiplaying rules, IP bans and per-player
  moderation all assume distinct addresses. Worth agreeing with Arkadia's admins first,
  and a single stable IP is at least whitelistable.
- **Passwords traverse the proxy.** Already true for opt-in proxy mode, but different in
  kind once this is the default path.

## Client support

Done (`src/web/proxySession.ts`, `src/shared/socket/transport.ts`, `MudClient`, `main.ts`):

- A per-tab session id in `sessionStorage`, generated with the CSPRNG and dropped on a
  deliberate disconnect.
- `framedCodec` decodes the protocol; the proxy is recognised by its `/attach` path, so
  the existing proxy setting configures it with no new UI.
- A resume is announced in the output, along with any dropped byte count.
- Returning to a tab whose socket died reconnects automatically — but only behind a
  session proxy, where it costs the player nothing.

Still open:

- **The timestamp is decoded but not yet used.** `processIncomingData()` receives it and
  ignores it, so the 60 `Date.now()` calls across 21 scripts still stamp replayed output
  with the time the browser woke up. This is the cross-cutting half of the work.
- No UI for choosing a session proxy; it is inferred from the URL.

Not needed after all: suppressing the client's 3-second `core.ping`. That was worth doing
when the proxy billed per WebSocket message; on a VPS it costs nothing and still measures
the real round trip to the game.
