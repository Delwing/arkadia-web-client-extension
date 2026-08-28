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

## Why not Cloudflare

This was first built as a Durable Object, on the reasoning that the deploy story already
existed in the client's "host your own proxy" wizard. The measurements killed it, and
they are worth recording so nobody re-treads the ground — the spike itself is on the
`spike/session-proxy` branch.

The free plan allows 13,000 GB-s of Durable Object duration and 100,000 requests a day.
Holding a connection open bills residency for the whole session, and hibernation — the
usual way to stay cheap — evicts the object from memory, which kills the socket. At 450
GB-s per player-hour that is **29 player-hours a day**, and WebSocket messages count as
requests, so the client's own 3-second ping alone spends 2,400 an hour. Both meters land
in the same place: single-digit concurrent players. Paid works out around $14/month for
thirty players, which is more than a VPS that also has none of the eviction semantics.

Two implementation traps cost a day each and would cost the same again: a server-side
WebSocket in a Durable Object delivers binary frames as a `Blob` unless `binaryType` is
set, and `new Uint8Array(blob)` is silently empty — every write "succeeds" having sent
nothing. And queued writes must copy their bytes, since `event.data`'s buffer only lives
for the listener.

Long-lived idle connections are what serverless is priced worst for. A plain process is
the right tool.

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

That is wired through now, in `@shared/eventClock`: the frame's timestamp reaches trigger
handlers and GMCP listeners alike, `client.now()` returns it while a line is being
processed, and `scheduleFromEvent()` puts a delay's deadline on the event rather than on
the moment of arrival. The rule for callers is that stamping *when something happened*
uses the event clock while measuring *how long ago* stays on `Date.now()` — and that only
output can be replayed, so anything driven by a player's own command is live by
definition.

## Compression

A client behind this proxy cannot speak MCCP end to end — MCCP2 is one zlib stream for
the life of the telnet connection, so a client attaching halfway through inflates
garbage. That is why the client declines it here.

Declining is not doing without. This process holds the telnet connection for the whole
session, so it is the right end of the wire to be the zlib peer: it answers
`IAC WILL COMPRESS2` itself, inflates, and buffers plaintext. The browser hop is then
compressed by the WebSocket's own `permessage-deflate`, whose context belongs to the
connection — a resuming client starts a fresh one, which is exactly the property MCCP
lacks. Both hops end up compressed and resume still works.

Arkadia offers `COMPRESS2` (86) and the older `COMPRESS` (85); only 86 is answered.
Nothing else in the telnet stream is touched: GMCP, ECHO and the prompt markers are
forwarded byte for byte. Safari does not implement `permessage-deflate` and falls back to
an uncompressed browser hop rather than failing. `-mccp=false` turns the upstream half
off.

## Sessions

A session is addressed by an opaque id the client generates and stores. **It is a
credential**: whoever holds it attaches to a logged-in character. Generate it with
`crypto.randomUUID()` or better, keep it per character, and never log it whole — this
end enforces only a 20–200 character length and logs a six-character prefix.

It travels in the handshake, not the URL:

```
Sec-WebSocket-Protocol: arkadia-session-v1, s.<id>, b.<build>, o.<bytes read>
```

The first entry says the client can read framed output and is selected back; the second
carries the id. Offer only the second and you get the raw byte stream, which is what
`wscat` wants. The last two are optional: the build, so a report can be tied to a deploy,
and how many bytes of output the client has already processed. `/leaving` takes the id as
its request body for the same reason the id is not in the URL.

A query string would be the obvious place and the wrong one: it is written into access
logs, error pages, upstream proxies and any screenshot of a devtools panel, so keeping it
out of them depends on every hop being configured to strip it — this deployment does
exactly that in its Caddyfile, and it is one edit away from not. A header that nothing
logs by default removes the class of mistake rather than guarding against it. A browser
cannot set arbitrary headers on a WebSocket, but it can set this one.

Guessing is not the threat that matters here — 128 bits of CSPRNG is not brute-forced —
so leakage is the whole of the risk, and the query string was the leak.

Attaching with an unknown id opens a fresh game connection; a known one resumes.
A second attach to a live session displaces the first, because two clients on one
character interleave input unpredictably.

## Resuming exactly

`o.<bytes>` is what makes a reattach lossless, and it has to come from the client because
nothing here can work it out. A write succeeding means the bytes reached a kernel buffer;
between there and the screen sit the network, the receive buffer, the browser's network
process, an IPC hop and the renderer's event loop — and the renderer is the one part that
freezes while every layer beneath it keeps accepting data. A WebSocket ping does not help
either: browsers answer those below the page, so a pong proves the socket lives and
nothing more.

That gap cost a real line: written 13 seconds after a client's last ping, while it still
counted as live, into a socket that was already gone.

So output written to a client is held until the client proves it was running afterwards —
its own ping, generated by page JavaScript, is that proof — and a returning client says
how far it actually got. Everything after that offset is replayed, nothing before it is.
Without the offset the only choices are duplicates or loss.

`-client-silence` (default 20s) decides when a quiet client stops being written to at all
and has its output buffered instead. It matters less than it used to: unconfirmed writes
are replayed either way, so the threshold now only chooses between holding and buffering,
not between arriving and vanishing.

Abandoned sessions are reaped after `-ttl`, which defaults to **35 minutes** — past
Arkadia's own inactivity limit of 30, on purpose. Holding slightly longer lets the game
be the one to end an abandoned session, and since a dead upstream lingers with its
buffer, the player who comes back at 33 minutes reads the game's own
"zostajesz rozlaczony z powodu bezczynnosci" instead of guessing at a bare login screen.
Undercutting it would throw that explanation away.

## Running it

```bash
go test ./...
go build -o session-proxy .
./session-proxy -addr 127.0.0.1:8080 -ttl 35m
```

Flags: `-addr`, `-upstream-host`, `-upstream-port`, `-buffer` (bytes held for a detached
client, default 2 MiB — see the sizing note in main.go), `-ttl`, `-dial-timeout`,
`-mccp`, `-client-silence`. `GET /health` reports the live session count.

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
  the existing proxy setting configures it with no new UI. The session id is offered as a
  handshake subprotocol rather than a query parameter.
- A resume is announced in the output, along with any dropped byte count.
- Returning to a tab whose socket died reconnects automatically — but only behind a
  session proxy, where it costs the player nothing.
- Compression is declined on a session proxy, and handed to it instead — see
  *Compression* above. Nothing to configure.
- Event time reaches triggers, GMCP listeners, timers, recordings and stored logs.
- Choosing proxy mode gets this proxy rather than the stateless worker. Nothing is
  forced; direct connections are untouched.

Still open:

- No UI for choosing a session proxy specifically; it is inferred from the URL, and
  proxy mode is still a single choice rather than a list of proxies.

Not needed after all: suppressing the client's 3-second `core.ping`. That was worth doing
when the proxy billed per WebSocket message; on a VPS it costs nothing and still measures
the real round trip to the game.
