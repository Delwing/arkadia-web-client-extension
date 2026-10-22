# Arkadia crowd Worker

Gathers the **spis zlomu** (weapons, shields, armour) and **odmiany** (the six
cases of an item name, from `odmien`) from players who opted in, and serves the
merged result publicly at `GET /crowd/snapshot`.

The client does not read the snapshot yet. It only contributes.

## What is collected

Only what an item *is*: nothing about how someone judged it, and nothing about
the player.

| kind      | fields |
|-----------|--------|
| `bron`    | short, typ, rodzaj, klute/obuch/ciete (damage types, 0/1), chwyt, magik, srebro, opis |
| `tarcza`  | short, magik, opis, oslona |
| `zbroja`  | short, typ, magik, opis, oslona |
| `odmiana` | mianownik, dopelniacz, celownik, biernik, narzednik, miejscownik |
| `iline`   | item (`zbroja`/`tarcza`), short, iLine: how `i` words the piece |
| `altname` | item, short, shortAlt: the name as evaluating gives it |

`iline` and `altname` are records of their own, keyed `item:short`, rather
than fields of the item. Many players evaluate a piece but few wear it and
teach the client its `i` line, and imported lists lack the evaluated name: as
item fields, the many without them would outvote the few with them. Voted on
separately, the leading one of each is set on the item in the snapshot.

Weight, volume, price and quality ratings are excluded: they depend on the
evaluating character's skill, so they would split every item into versions.
Location (`roomId`), colours and notes are personal and never sent. Fields are
whitelisted in `src/records.ts`, so anything else a client sends is dropped.

`src/records.ts` is mirrored in the client at `src/modules/crowd/crowdRecords.ts`.
A client test fails if the two differ, and both suites pin the same hash.

## How it stores

Observations, not truth:

- `variants`: one row per distinct version of a record (hash of kind + canonical payload).
- `confirmations`: which contributor sent which variant, capped at `MAX_CONFIRMATIONS` per variant.
- The snapshot picks, per item name (`short`) or noun (`mianownik`), the variant with
  the most confirmations from non-banned contributors, and reports that count.
  The other variants of that name are listed under its `alternatives`, so two
  different items sharing a name both stay visible.

The description (`opis`) is carried but left out of the hash: one item's
description changes with what is set into it ("pozostawiono miejsce na
wprawienie" / "wprawiono bardzo maly bezbarwny ..."), and hashing it would
split one item into a version per copy. A variant keeps the first description
sent for it, as a sample.

Clients call `POST /crowd/have` with hashes first and upload only what is
wanted, so re-syncing a mostly known list costs D1 reads, not writes.

## Identity

None. `POST /crowd/register` mints a random `contributorId` + `secret`
(bearer `<id>.<secret>`; only the secret's SHA-256 is stored). It exists for
counting distinct witnesses, the daily quota, and banning one source:

```sh
npx wrangler d1 execute arkadia-crowd --remote \
  --command "UPDATE contributors SET banned = 1 WHERE id = '<contributorId>'; UPDATE meta SET value = 0 WHERE key = 'last_export'"
```

The second statement makes the next hourly export rebuild; without it the ban
shows within a day, at the forced daily export. A banned contributor is not
told; its uploads are ignored. Registration is
limited per IP per day, and the IP is stored only as `sha256(ip + day)`.

## Routes

| route                  | auth   | purpose |
|------------------------|--------|---------|
| `GET /health`          | none   | `{ status, database, snapshots }` |
| `GET /crowd/snapshot`  | none   | merged list from KV, any origin, `ETag` / 304 |
| `POST /crowd/register` | none   | mint a contributor |
| `POST /crowd/have`     | bearer | `{ hashes }` to `{ wanted }`, up to 5000 |
| `POST /crowd/submit`   | bearer | `{ items: [{ kind, record }] }`, up to 500 |

## First deploy

```sh
cd crowd-worker
npx wrangler d1 create arkadia-crowd     # put the id into wrangler.jsonc
npx wrangler kv namespace create SNAPSHOTS   # put the id into wrangler.jsonc
yarn migrate                             # apply migrations/ to the remote DB
npx wrangler deploy
```

Done on 2026-10-22. Pushes to master that touch `crowd-worker/` now run
migrations and deploy via `.github/workflows/crowd-worker.yml`, so migrations
must stay additive. The API token needs D1 and Workers KV edit rights in addition to
Workers.

## Free-tier budget

- Writes: tables are `WITHOUT ROWID` with no index beyond the key, because D1
  counts every index entry as a row written. A new record costs about three
  rows (variant, confirmation, `meta`); a record the Worker already has costs none.
- Reads: downloads never touch D1. An hourly cron (`src/snapshot.ts`) exports
  the snapshot to KV, and reads the big tables only if something was submitted
  since the last export, or once a day regardless. Downloads are one KV read
  (100k a day free; R2 is the next step past that), and a client sending
  `If-None-Match` gets a 304 when nothing changed.

## Local

```sh
yarn migrate:local && yarn dev
yarn test        # D1 is node:sqlite here, with the real migrations applied
```
