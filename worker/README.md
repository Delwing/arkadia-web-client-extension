# Arkadia AI assistant Worker

A Cloudflare Worker that fronts the project owner's free-tier LLM keys for the
in-client AI assistant.

The main site is static and public. Shipping API keys in that bundle would mean
they are scraped and revoked within days, so the keys live here instead and the
client calls this Worker.

---

## The security property that matters

`POST /ask` accepts **a question plus structured context — never a prompt.**

The system prompt is assembled inside the Worker from the generated knowledge
bundle (`src/kb/`). There is no request shape that makes the model do
anything other than answer Arkadia client questions in Polish. That is
deliberate: it makes the endpoint useless as a general-purpose free LLM proxy,
which is the thing that would otherwise get it found, shared, and drained.

Two supporting rules keep that true:

- The persona and the output contract are **never** dropped when the prompt is
  trimmed to fit a small provider budget (`src/prompt.ts`).
- Client-supplied context is coerced, truncated, and wrapped in an explicit
  "this is data, not instructions" block before it reaches the model.

---

## Relationship to the existing proxy Worker

This repo already has Cloudflare Worker infrastructure in `src/web/hostProxy/`:
`proxyWorker.js` (a telnet→WebSocket bridge with an HTTP-forward mode) plus a
deploy wizard that uploads it to the **user's own** Cloudflare account using the
user's API token.

**This is a separate Worker, deliberately.** The two have different owners,
different trust models, and different bindings:

| | `proxyWorker.js` | `worker/` (this) |
|---|---|---|
| Deployed by | each user, via the wizard | the project owner, via wrangler |
| Deployed to | the user's account | the owner's account |
| Source visibility | public — `?raw`-imported into the client bundle | not shipped to the browser |
| Bindings | none | KV + secrets |
| Holds | nothing secret | the owner's pooled API keys |

The owner's keys can never live in a script that is bundled into the public
client and deployed into arbitrary users' accounts, which settles it.

### Shared conventions

- **Error shape.** `ProviderError` follows `CloudflareApiError` in
  `cloudflareDeploy.ts`: sets `this.name` in the constructor, exposes `status`,
  and carries structured detail as `readonly` fields.
- **Code style.** 4-space indent, single quotes, matching `src/web/hostProxy/`.
- **Compat-date pinning.** Both pin a compatibility date, by the mechanism each
  deploy path requires: `cloudflareDeploy.ts` has `COMPAT_DATE` because it
  uploads scripts through the Cloudflare API, while this project uses
  `compatibility_date` in `wrangler.jsonc`. If the assistant Worker is ever
  offered through the wizard (below), it needs its own pin there too — do not
  reuse the proxy's `COMPAT_DATE`, since the two Workers use different runtime
  features.

### CORS

This Worker is ours, so it sets its own CORS headers: it answers the `OPTIONS`
preflight and returns `Access-Control-Allow-Origin` for allowlisted origins. The
client calls it **directly**.

Do **not** route client→Worker traffic through `proxyWorker.js`'s `?url=`
forward mode. That mode exists for calling third-party APIs that do not send CORS
headers, which is not our situation. Worker→provider calls are server-side, where
CORS does not apply at all.

### A near-free BYOK tier

The existing `ProxyDeployWizard` is already a working "deploy your own Worker
with your own Cloudflare token" flow. That makes **"the user deploys their own
assistant Worker holding their own Gemini key"** cheap to offer, and arguably a
better top tier than in-browser BYOK: the key ends up server-side in the user's
own account rather than sitting in browser storage.

A single-user deployment also needs far less than this one — no cross-user cache,
no daily quota, no Turnstile — so it could run with **no KV binding at all**.
Worth noting if that path is built: the wizard's current token scope
(`workers_scripts:edit` + `account_settings:read`) is enough to upload a script,
but **not** to create a KV namespace or set secrets. A keyless-binding variant
avoids needing to widen it.

Suggested tiers, best to worst:

1. **Owner pool** (this Worker) — default, free to the user, quota-limited.
2. **User-deployed assistant Worker** via the wizard — their key, server-side, no quota.
3. **In-browser BYOK** — their key in browser storage.
4. **Clipboard bridge** — zero infrastructure; the `pool_exhausted` fallback.

---

## Endpoints

### `POST /ask`

```jsonc
{
  "question": "Jak ustawic trigger na zabicie?",  // required
  "kbVersion": "1.01ebb0588a195964",             // required (bundle content hash)
  "context": {                                    // optional, size-capped
    "screen": "triggery",
    "character": "Zbyszko",
    "settings": { "shortenExits": true },
    "recentLines": ["..."],
    "existingTriggers": [],
    "existingAliases": []
  },
  "deviceId": "stable-per-install-id",            // optional but recommended
  "turnstileToken": "..."                         // required on first use
}
```

Responds with `text/event-stream`. Frame types:

| `type`      | Meaning |
|-------------|---------|
| `meta`      | Cache metadata. Only sent on a cache hit. |
| `delta`     | Incremental Polish prose. |
| `restart`   | **Discard everything received so far** and render subsequent deltas as a fresh answer. Sent when a provider died after already emitting text. |
| `proposals` | Validated structured proposals (settings / alias / trigger). |
| `done`      | Terminal success. Carries the caller's quota state. |
| `error`     | Terminal failure. Carries a structured `status`. |

Error statuses: `pool_exhausted`, `quota_exceeded`, `challenge_required`,
`challenge_failed`, `bad_request`, `forbidden_origin`, `too_large`,
`internal_error`.

**Graceful exhaustion.** When every provider is cooling down the Worker does not
return a generic error. It returns:

```json
{ "type": "error", "status": "pool_exhausted", "message": "...", "retryAfter": 21585 }
```

so the client can fall back to its clipboard-bridge mode ("copy this prompt into
ChatGPT") and offer the user their own key.

**Cache measurement.** Every response carries `x-ai-cache: hit|miss`, and hits
add `x-ai-cache-tier: edge|kv`. That is how you measure the hit rate, which is
the number that determines whether the pool survives.

### `GET /health`

Operator view of pool state — which entries are cooling, until when, and why. No
keys are exposed.

---

## Setup

### 1. Install

```bash
cd worker
yarn install
```

### 2. Create the KV namespace

```bash
npx wrangler kv namespace create AI_KV
```

Put the printed id into `wrangler.jsonc`, replacing
`REPLACE_WITH_KV_NAMESPACE_ID` — in **both** the top-level `kv_namespaces` and
the `env.mock` block.

One namespace holds everything (pool health, quota counters, device passes,
cached answers) under distinct key prefixes. Splitting them would not buy
anything: the free-tier allowances are per account, not per namespace.

### 3. Set the secrets

```bash
npx wrangler secret put HASH_SALT          # any long random string
npx wrangler secret put TURNSTILE_SECRET   # from the Turnstile dashboard
npx wrangler secret put GEMINI_KEY_1
npx wrangler secret put GEMINI_KEY_2       # optional, rotation
npx wrangler secret put GROQ_KEY_1
npx wrangler secret put OPENROUTER_KEY_1
```

`HASH_SALT` matters: device ids and IPs are salted-hashed before they touch KV,
so the Worker never stores a raw identifier. Changing it resets everyone's daily
quota and device passes.

Only keys you actually set need to exist. **A pool entry whose `keySecret` is
unset is silently dropped from the pool** — that is the intended way to disable a
provider without editing config.

### 4. Deploy

```bash
npx wrangler deploy
```

---

## Configuring the pool

The pool is the `AI_POOL` var in `wrangler.jsonc`: a JSON array, tried in
ascending `priority`. Ordering is by `priority` then `id`, so failover order is
deterministic regardless of how the array is written.

```jsonc
{
  "id": "gemini-1",              // stable — it keys the health blob, never reuse
  "provider": "gemini",          // gemini | groq | openrouter | mock
  "model": "gemini-2.5-flash",
  "keySecret": "GEMINI_KEY_1",   // name of the secret holding the key
  "priority": 10,                // lower is tried first
  "maxPromptTokens": 24000,      // prompt budget — see below
  "maxOutputTokens": 1500,       // server-side cap, never client-supplied
  "supportsToolLoop": true       // can this model hold the JSON contract?
}
```

Multiple entries may share a provider with different keys; the router rotates
through them in priority order.

### Provider ordering rationale

| Provider | Why it sits where it does |
|---|---|
| **Gemini** (AI Studio free) | Best Polish of the free tier, generous tokens-per-minute. First. |
| **Groq** | Very high requests/day but low free tokens-per-minute. Second, with a lean prompt. |
| **OpenRouter `:free`** | 20 req/min and only 50 req/day (1000/day if the account has ever purchased $10 in credits — a one-time purchase raises it permanently). Last resort. |

### ⚠️ The Groq TPM caveat

**Groq's free per-model tokens-per-minute limit is account-specific and is not
reliably published.** Groq's own documentation calls its limits table "a high
level summary" and warns "there may be exceptions to these limits", directing
you to your account for the real numbers.

This matters more than it sounds. If your system prompt exceeds the per-minute
token allowance, the request is **rejected with a 429 before the model reads a
word of it**. That looks identical to a quota outage and burns a pool slot for
nothing.

So:

> **Check <https://console.groq.com/settings/limits> for your own account's TPM
> and set `maxPromptTokens` on each Groq entry accordingly.** The default of
> 4000 is a conservative guess, not a researched value for your account.

Some organisations get separate **ITPM/OTPM** (input- and output-tokens-per-minute)
caps instead of a single combined TPM; those are visible only by hovering the TPM
value on that page.

This is why `maxPromptTokens` is per-entry configuration rather than a constant.
`src/prompt.ts` drops knowledge sections in reverse priority order until the
prompt fits the declared budget — Gemini gets the full bundle, a tight Groq entry
gets a lean one, and the persona and output contract survive either way.

### Gemini API surface, and its escape hatch

Gemini entries default to the **native Interactions API**
(`POST /v1beta/interactions`). Google now describes `generateContent` as legacy
and has pointed its guides at Interactions.

The Interactions schema is still tagged Beta. If a Gemini entry starts returning
400s after an upstream change, switch that entry to the OpenAI-compatibility
surface by adding a `baseUrl`:

```jsonc
{ "id": "gemini-1", "provider": "gemini",
  "baseUrl": "https://generativelanguage.googleapis.com/v1beta/openai", ... }
```

The registry routes any Gemini entry with `/openai` in its `baseUrl` through the
OpenAI-compatible adapter instead. No code change needed.

### Other settings

| Var | Default | Purpose |
|---|---|---|
| `ALLOWED_ORIGINS` | — | Comma-separated origin allowlist. `*.example.com` wildcards supported. Empty disables the check. |
| `DAILY_QUOTA` | `20` | Questions per device per UTC day. |
| `MAX_CONTEXT_BYTES` | `8000` | Cap on the serialized `context` field. |
| `MAX_QUESTION_CHARS` | `2000` | Cap on the question. |
| `CACHE_TTL_SECONDS` | `2592000` | Cached answer lifetime (30d). |
| `KV_CACHE_WRITES` | `true` | Whether to use the KV cache tier. See write budget. |
| `TURNSTILE_ENABLED` | auto | Defaults on when `TURNSTILE_SECRET` is set. |

---

## The KV write budget — the real constraint

Confirmed free-tier allowances (Cloudflare docs, checked 2026-08-25):

| Resource | Free allowance |
|---|---|
| Workers requests | 100,000 / day |
| Workers CPU time | **10 ms per invocation** |
| Workers subrequests | 50 per request |
| KV reads | 100,000 / day |
| **KV writes** | **1,000 / day** |
| KV deletes | 1,000 / day |
| KV value size | 25 MiB |

**1,000 writes/day is the binding constraint**, not the request limit. Three
design decisions follow from it, and changing them will break the deploy quietly
rather than loudly.

### 1. Pool health writes only on transitions

`src/poolHealth.ts` holds all health in **one JSON blob** and writes it only when:

- an entry newly enters cooldown (not on every failure while already down), **and**
- the cooldown is at least 5 minutes — short tokens-per-minute cooldowns stay in
  isolate memory and simply expire, because they would be over before another
  isolate could act on them, **and**
- at least 60 seconds have passed since the last write.

Recovery costs **zero** writes: an entry is healthy again once its timestamp is
in the past, which requires no write at all.

Nothing is written on a successful request.

The blob is read-modify-written with no locking, and KV is eventually consistent
(up to ~60s to propagate globally). That is fine — the blob is a performance
hint, not a ledger. A lost write costs one doomed request that the router fails
over anyway.

### 2. Quota is charged on use, not on arrival

One write per **live provider call**. Cache hits, rejected requests, and
validation failures cost nothing. As the cache hit rate climbs, KV writes fall
proportionally.

### 3. The answer cache is two-tier

- **Tier 1: the edge Cache API.** Free, no write quota, but per-colo. For a
  single-country player base that is a mild limitation.
- **Tier 2: KV.** Global, catches cross-colo misses, but each miss costs a write.
  A tier-2 hit is promoted into tier 1 for free.

Rough arithmetic: each fully-uncached question costs **2 KV writes** (one quota,
one cache), so ~500 live questions/day — which is the same order as the key
pool's own daily capacity, so the two ceilings are matched.

If the budget gets tight, set `KV_CACHE_WRITES=false`. The edge tier keeps
working; you lose only cross-colo cache sharing.

### A note on the 10 ms CPU limit

Streaming is I/O wait, which does not count as CPU, and the per-chunk SSE parsing
is deliberately hand-written and lean. This is also why prompt sizing uses a
crude character-count token estimate rather than a real BPE tokenizer — running
one over a multi-kilobyte prompt would consume a serious slice of the budget.

---

## The cache is the biggest quota multiplier

All users share one key pool, and MUD players ask the same ~30 questions
forever. The cache is keyed on `hash(normalizedQuestion + kbVersion)` and is
shared across every user.

Normalization (`src/normalize.ts`) is aggressive on purpose — lowercase, fold
Polish diacritics, strip punctuation, drop stopwords, collapse whitespace. All of
these hit the same cache entry:

```
"Jak ustawić trigger?"  "jak ustawic trigger"  "JAK USTAWIĆ TRIGGER!!!"
"jak mam ustawic trigger"
```

Word **order** is preserved, because it carries meaning: "jak dodac alias" and
"jak usunac alias" stay distinct.

Two deliberate exclusions:

- **Context is not part of the cache key.** It is per-user state; folding it in
  would drive the hit rate to ~zero. Answers are written to be
  context-independent.
- **Questions about the asker's own state are not cached at all**
  (`isCacheable()` — "dlaczego *moj* trigger nie dziala").

`kbVersion` is part of the key, so a new knowledge bundle invalidates every
cached answer at once with no KV sweep — which matters, since a sweep would burn
the delete allowance.

### What a cache entry holds

The key is a truncated SHA-256, so it says nothing about what was asked. Each
entry therefore stores its **normalized** question alongside the answer, which
is what makes a `wrangler kv key list` / `kv get` sweep worth running: you can
see which questions are actually being asked (the ones worth hand-writing into
the knowledge bundle) and spot-check whether the cached answer is any good.

It is the normalized form only — never the raw text a user typed. Diacritics,
punctuation, phrasing and filler are already gone by then, which is most of what
makes free text identifying. Entries written before this field existed are still
served; they just have nothing to show. Nothing else records the question:
the `[ask]` log line deliberately omits it.

**There is nothing to bump.** `KB_VERSION` is derived:

```
KB_VERSION = `${bundle.formatVersion}.${bundle.version}`
```

`bundle.version` is a truncated SHA-256 that `scripts/build-assistant-kb.ts`
computes over the bundle content with `generatedAt` excluded — so an unchanged
tree keeps its cache key, and any change to a setting, command, event, schema or
doc produces a new one on the next `yarn build:assistant-kb`.

---

## Where the knowledge comes from

`src/kb/index.ts` **imports `public/assistant-kb.json` directly**, by relative
path. `scripts/build-assistant-kb.ts` generates that file from the client's own
sources with the TypeScript compiler API: every setting with its real default and
bounds, every client command, `SUPPORTED_EVENTS`, the proposal schemas taken
verbatim from the real interfaces, and the user docs.

It used to be a hand-written Polish paraphrase in this directory, and it had
already drifted — wrong proposal `kind` names, an alias example anchored with
`^…$` that the client anchors again itself, a settings list a third the size of
the real one.

**Why a direct import and not a copy step.** A copied `worker/src/kb/bundle.json`
is a second artefact that stays correct only while somebody remembers to re-run
the copy. The import has no such step: esbuild inlines the JSON at bundle time
(`wrangler dev` and `wrangler deploy` alike — the deployed Worker is ~305 KiB,
66 KiB gzipped, against a 3 MB limit), and Vitest resolves the same path with no
config. `src/shared/assistant/knowledgeBundle.ts` was written dependency-free and
DOM-free precisely so this is possible; it is the only client module the Worker
touches.

The cost is that the Worker cannot be built from a checkout of `worker/` alone.
That is the right trade — the Worker is not independently deployable from a
client it has to agree with.

**Run `yarn build:assistant-kb` in the repo root before `wrangler deploy`.** The
bundle is committed, so this only matters when the client sources have changed.

### What is still hand-written

`src/kb/policy.ts`: the persona, the output contract and the regex rules. Those
are prompt *policy* — how this endpoint is allowed to behave — not facts about
the client, and they do not belong in a build artefact describing settings and
commands. The one thing they share with the generated side is the list of
proposal `kind` names, which comes from `PROPOSAL_KINDS`.

### Budget

The fat projection is ~51k tokens and fits **no** provider in the pool (Gemini,
the most generous, allows 24k). So the prompt is built from the **lean**
projection (~13k by this Worker's pessimistic 3-chars-per-token estimate), and
full documentation pages are appended one at a time only while they still fit the
entry's own `maxPromptTokens`. See `src/prompt.ts`.

---

## Abuse protection

| Layer | Mechanism |
|---|---|
| Origin allowlist | `ALLOWED_ORIGINS`; a present-but-unlisted origin gets 403. A missing `Origin` is allowed (non-browser callers) — quota and Turnstile are the real defence. |
| Turnstile | First use per device only. |
| Daily quota | `DAILY_QUOTA` per device per UTC day, keyed on a salted hash. |
| Burst limiter | Optional `BURST_LIMITER` rate-limit binding. |
| Size caps | 32 KB body, `MAX_QUESTION_CHARS`, `MAX_CONTEXT_BYTES`. |
| Output cap | `maxOutputTokens` is server-side per pool entry; the client cannot raise it. |

### Turnstile is per device, not per question

A challenge on every question would be miserable, and Turnstile tokens are
single-use and valid for only five minutes. So a successful verification mints a
**device pass** in KV (30 days), and later questions present the pass instead.
One KV write per device rather than per question — which also keeps this inside
the write budget.

Client-side, render the widget and send the `cf-turnstile-response` value as
`turnstileToken`. The Worker replies `challenge_required` when a device needs one.

Cloudflare publishes test keys for local work: sitekey
`1x00000000000000000000AA` and secret `1x0000000000000000000000000000000AA`
always pass. Test sitekeys and test secrets must be paired — a production secret
rejects dummy tokens.

### Quota subject

Prefers `deviceId` (survives a changing IP, so mobile users are not punished for
roaming), falls back to `CF-Connecting-IP`. A `deviceId` shorter than 8
characters is treated as absent, since it would be trivially forgeable and could
be used to land on someone else's counter. Both are salted-hashed with
`HASH_SALT`; raw values never reach KV.

---

## Local development

### Keyless smoke test

```bash
yarn dev:mock          # npx wrangler dev --env mock
```

Runs the entire request path — origin check, Turnstile gate, quota, cache,
router, streaming, proposal extraction — against a mock provider. **No API keys
and no network access required.**

```bash
curl -s http://127.0.0.1:8787/health

curl -N -X POST http://127.0.0.1:8787/ask \
  -H 'content-type: application/json' \
  -H 'origin: http://localhost:5173' \
  -d '{"question":"Jak ustawic trigger na zabicie?","kbVersion":"1.01ebb0588a195964","deviceId":"local-dev-device-1"}'
```

The mock env sets `DAILY_QUOTA=5` and a real `ALLOWED_ORIGINS` so both guards are
actually exercised locally rather than silently disabled.

### Driving the failure paths

Include a magic token in the question. A bare token affects every mock entry;
suffix it with `@<entry-id>` to target one.

| Token | Effect |
|---|---|
| `__force429@mock-primary` | Primary rate-limits (30s) → **silent failover** to the secondary. |
| `__forcequota@mock-primary` | Primary exhausts its daily quota (6h) → cooldown is long enough to be **persisted**, so `/health` shows it cooling. |
| `__force500@mock-primary` | Non-quota failure → fails over **without** cooling the entry. |
| `__forcemid@mock-primary` | Primary streams text then dies → client receives a **`restart`** frame. |
| `__forcequota` (bare) | Every entry down → **`pool_exhausted`** with a `retryAfter`. |

### Tests

```bash
yarn test        # 151 unit tests, no network
yarn typecheck   # tsc --noEmit
yarn build       # wrangler deploy --dry-run
```

The suite covers failover ordering, cooldown parsing, cache key normalization,
the KV write budget, prompt sizing, proposal validation, and SSE parsing. It runs
under plain Vitest in a Node environment against Web-standard APIs — no Workers
pool, no wrangler process.

`vitest.config.ts` sets `root` explicitly. Without it Vitest walks up the tree
and picks up the main project's `vite.config.ts`. This project is intentionally
independent of the main Vite build: its own `package.json`, its own dependency
tree, no shared build config.

---

## Layout

```
src/
  index.ts            fetch handler, routing, request validation
  config.ts           pool + runtime config parsing, origin allowlist
  router.ts           failover ordering, cooldown marking, exhaustion
  poolHealth.ts       KV health blob, transition-only writes
  cooldown.ts         Retry-After / rate-limit header + body parsing
  cache.ts            two-tier cross-user answer cache
  normalize.ts        question normalization, cache keys
  quota.ts            per-device daily quota
  turnstile.ts        siteverify + device passes
  prompt.ts           provider-aware prompt sizing
  proposals.ts        streaming prose/JSON splitter, proposal validation
  sse.ts              SSE parse/emit
  types.ts            wire types
  kb/index.ts         the generated knowledge bundle, rendered into sections
  kb/policy.ts        persona / output contract / regex rules (hand-written)
  providers/
    gemini.ts         native Interactions API
    openaiCompat.ts   Groq, OpenRouter, Gemini-via-compat
    mock.ts           keyless local testing
```

---

## Verified vs. assumed

Checked against primary docs on 2026-08-25:

- Cloudflare Workers and KV free-tier limits, and Turnstile's siteverify
  request/response shape, error codes, and test keys.
- Groq's rate-limit headers, including that `x-ratelimit-reset-*` are **Go-style
  duration strings** (`2m59.56s`, `7.66s`) rather than timestamps, and that the
  requests headers are per-**day** while the token headers are per-**minute**.
- OpenRouter's `:free` limits (20 RPM / 50 RPD, 1000 RPD after a $10 lifetime
  purchase) and its documented **mid-stream errors inside a committed 200**.
- Gemini's Interactions API endpoint, auth header, streaming event names, and
  string-coded (`rate_limit_exceeded`) error envelope.

Could **not** be confirmed from primary sources, and handled defensively:

- **Gemini free-tier RPM/TPM/RPD.** Google has removed the per-model table from
  its docs; the numbers are visible only in the AI Studio dashboard. Nothing in
  this Worker hardcodes them.
- **Gemini rate-limit response headers.** None are documented at all. The
  cooldown parser therefore falls back to the JSON error body, and then to a
  default, rather than assuming a header exists.
- **Gemini's `RetryInfo` / `retryDelay` error detail.** Not in any current doc
  page. Parsed opportunistically if present; never relied upon.
- **Groq free-tier TPM per model.** See the caveat above.
- **Gemini Interactions `generation_config.max_output_tokens`.** Inferred from
  the snake_case convention, not read off a reference page. The
  OpenAI-compatibility `baseUrl` is the documented escape hatch if it is rejected.

Everything except the mock provider path is unverified against **live** APIs —
that requires real keys.

---

## Observability — answering "are users hitting limits?"

`observability.enabled` is set in `wrangler.jsonc`, so console output is captured
by **Workers Logs** and is filterable in the Cloudflare dashboard
(*Workers & Pages → the Worker → Logs*). Retention on the free plan is short —
days, not weeks — so check within a few days of a release, or export what you
need. Nothing here is written to KV: the free tier's 1,000 writes/day is the
scarcest resource the Worker has, and spending it on telemetry would starve pool
health and the answer cache.

### The two log lines

**`[ask] {...}`** — one per request, including the early returns that matter most.

| field | meaning |
|---|---|
| `outcome` | `ok`, `quota_exceeded`, `pool_exhausted`, `challenge_required`, `burst_limited`, `internal_error` |
| `servedBy` | which pool entry answered (`gemini-1`, `groq-1`, …) |
| `cached` | `true` means it cost the pool nothing |
| `tier` | `edge` or `kv`, on cache hits |
| `quotaUsed` / `quotaLimit` | that device's daily count |
| `cooling` | how many pool entries were rate-limited at that moment |
| `ms` | wall time |

**`[pool] <id> (<provider>/<model>) failed: …`** — emitted whenever a provider
declines, with status, quota flag and response body. Without it every failure
looks identical from the outside (`pool_exhausted`), which is how a Groq HTTP 413
went undiagnosed through several restarts.

### What to look for

- **Is the shared pool enough?** Count `servedBy` values. Gemini answering nearly
  everything means the free tier is coping. Groq or OpenRouter appearing often
  means Gemini is running out and the fallbacks are carrying real traffic.
- **Is the daily cap too tight?** Any `outcome:"quota_exceeded"` is a real user
  turned away. A handful is fine; a steady stream means raise `DAILY_QUOTA` or
  reconsider the number.
- **Is the cache doing its job?** `cached:true` over total `ok` is the hit rate.
  This is the number that decides whether the pool needs more keys — a high hit
  rate means quota pressure is far lower than raw request counts suggest.
- **Is anything permanently broken?** `[pool]` lines with a repeating status
  (401, 404, 413) are configuration, not load. A 413 in particular means that
  entry's `maxPromptTokens` is above what the provider will actually accept.
- **Turnstile:** `challenge_required` in production means the panel has no widget
  yet (known gap) — those users are being turned away before reaching a provider.
