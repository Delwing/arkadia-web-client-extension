# Sync v2 — plan

Dev-facing. `docs/` root is user-facing (see `docs/SYNCHRONIZACJA.md`); this file is deliberately in `docs/dev/`.

Status: **stages 1–3 done.** Sync v2 runs behind a flag (`localStorage.setItem('arkadia.syncV2', '1')`,
reload; it then replaces the v1 listener and engine for that browser). Daily operation counts are in
`localStorage['arkadia.syncV2.usage']`. Stages 4–5 not started. Open from stage 3:
- Firestore security rules must allow the owner to read/write `users/{uid}/syncV2/*`.
- Other tabs of the same browser don't refresh IndexedDB-backed data applied by the syncing tab
  (localStorage values do, through the `storage` event); planned `BroadcastChannel`.
- The two-device Playwright test needs a Firestore mock with listeners and transactions; the same
  scenarios run as engine unit tests against an in-memory transport (test/modules/syncV2).

---

## 1. Why

Players keep the client open on a PC and a phone at the same time and switch between them without closing
tabs. Both devices write, often within minutes of each other. Today's design treats that as an exception:

- **Whole-state blobs.** Each category is exported as one string and compared by checksum against a stored
  sync base (`planSync` in `firebaseUnifiedSync.ts`). If both sides moved, it's a conflict. A tab that has
  been open since yesterday holds yesterday's state, so it either stalls in a conflict or overwrites newer
  data with a whole-category upload.
- **Conflicts block the whole category.** A pending conflict stops upload and download for that category
  until the user resolves it in Eksport / Import. Knowledge (`knowledge`, merge `append`) changes on every
  device during play, so it was permanently in conflict and effectively stopped syncing.
- **Change detection only sees localStorage.** `syncEngine` listens to `TypedStorage.onAnyChange`.
  IndexedDB-backed data (knowledge, kills, visited rooms, notes, multibinds) only uploads when an unrelated
  localStorage write happens to trigger a sync. Conversely, any localStorage write — including
  non-synced ones like `mapperRoomId` on every move — schedules a full sync.
- **Each data type is handled in many places.** `CATEGORY_REGISTRY`, the export/import `switch` blocks in
  `@web/options/exportUtils`, a second serializer for files (`buildExport` / `applyImportedData`),
  per-category `syncOptions`, `ExportOptions`, a character picker, conflict UI. A gap between them is how
  the knowledge bug happened.
- **One Firestore document.** Every category is a field of `users/{uid}/sync/{SYNC_DATA_DOC}`. Firestore
  caps a document at 1 MiB; visited rooms, kill records and knowledge tick events grow without bound and
  are never compacted.
- **User data is scattered.** Some in localStorage as `character:key` (whether a key is per-character is
  guessed via `CHARACTER_BASE_KEYS` in `parseCharacterStorageKey`), some in separate IndexedDB databases,
  each with its own access code and none recording when or where a value changed.

## 2. Goals and non-goals

Goals:

- Two devices writing at the same time always converge, with no user action and no lost data.
- A stale tab can never overwrite newer data.
- One registry entry per data type defines storage, merge rules, sync and backup. Adding a type is one entry.
- No per-category or per-character selection. Everything user-owned syncs.
- Stay within the Firebase free tier (section 9) for the expected user count, and keep the cloud transport
  replaceable.
- Bounded cloud storage: logs are compacted, no document approaches 1 MiB.
- Existing users migrate automatically, including data that never synced (e.g. knowledge).

Non-goals:

- Real-time collaborative editing of the same item (newest-wins per item is enough).
- Resetting accumulated data (knowledge progress, kills, visited rooms). Not needed; no reset support.
- Syncing reference data downloaded from GitHub (map, NPCs, people, herbs, magics, knowledge/wiedza
  definitions). It stays a local cache.
- Syncing logs, recordings, custom sounds, sun tracker, plugins. Plugins may get their own API later.

Known and accepted: until stage 4 ships, knowledge does not sync reliably. The migration seeds from each
device's local data (section 10), so nothing is lost in the meantime.

## 3. Core principles

1. **Exchange changes, not whole state.** A device uploads only the records it changed. A stale tab only
   sends what it actually edited, so it can't overwrite anything else.
2. **Devices only append.** A device adds its own batches to the shared log with an atomic append and
   never rewrites what another device wrote. Only compaction rewrites, inside a transaction. No conflicts.
3. **Every merge is automatic, order-independent and idempotent.** `merge(a, b) == merge(b, a)` and
   applying a change twice is a no-op. This is what makes concurrent compaction and re-delivery safe.
4. **Merge rules are declared per field, not per category.** See section 5.
5. **The merge metadata lives next to the data** (timestamp, origin device, deletion marker), in one local
   store. Sync then reduces to "send records newer than the other side has seen".
6. **Write once.** Each change is written to the cloud once, in a batch. Nothing re-uploads whole state
   after the one-time migration seed.

## 4. Data inventory

### 4.1 Synced in v2

| Data | Current storage | v2 type(s) and key |
|---|---|---|
| binds (`binds`, `keymaps`) | localStorage global | `binds`, per key combo |
| `shortcuts` | localStorage global | `shortcuts`, per id |
| `triggers`, `aliases` | localStorage global | same, per id |
| `automationGroups`, `automationScripts` | localStorage global | same, per id |
| `shellSettings`, `renderSettings`, `mapSettings`, `behaviorSettings` | localStorage global | same, per field |
| `characterSettings` | all `character:key` entries, one blob | split into the character-scoped types it contains, per key; the profession CRDT (`mergeProfessionStates`) becomes the `profession` event type |
| `improveCounts` | `character:improve_counter_lifetime` | `improveCounts`, per character/skill |
| `deposits`, `containers` | `character:deposits`, `character:containers` | same, per character/place |
| `peopleEdits` | `character:peopleLocalEvents` | `peopleEdits`, per event id (already event-based) |
| `killCounts` | `ArkadiaKillsDB` (+ legacy `character:kill_counter`) | `kills`, per character/mob/day |
| `visitedRooms` | `ArkadiaVisitedRoomsDB` | `visitedRooms`, per character/room |
| `locationNotes` | `ArkadiaLocationNotesDB` | `locationNotes`, per room id |
| `multibinds` | `ArkadiaMultibindsDB` | `multibinds`, per room + index |
| `knowledge` | `ArkadiaKnowledgeDB` (library/book progress), `ArkadiaKnowledgeDetailsDBv*` (entries, levels, character metadata), `ArkadiaKnowledgeEventsDB` (ticks, level changes) | `knowledgeLibraries`, `knowledgeBooks`, `knowledgeDetails`, `knowledgeEvents` — split so each field gets its own rule |
| oswajanie (new) | `oswajanie` DB: `feeding`, `animals`, `foodGroups` | `taming`: feeding entries per stable id, level-ups per character/animal/level, food group per food |
| enemy resistances (new) | `ArkadiaEnemyResistances` | `enemyResistances`, per enemy name + area |
| złom (new) | `ArkadiaZlom` (one snapshot) | `zlom`, per kind + item `short` |
| transport stats (new) | `ArkadiaTransportStatsDB` | `transportSegments`, per `segmentKey` |
| delivery stats (new) | `ArkadiaDeliveryStats` (per character) | `deliveries`, per character/event id |
| `uiSettings`, `buttons`, `radial` | localStorage global (`uiSettings`, `mobileButtonSettings`, `desktopButtonSettings`) | device-scoped, one whole value per device (section 5) |

Note: oswajanie `feeding` / `animals` use auto-increment ids today, which collide across devices. The local
migration assigns stable ids (`${deviceId}:${n}`) and new entries use the record id scheme from section 6.

### 4.2 Never synced

Reference caches (`ArkadiaMapDB`, `ArkadiaNpcDB`, `ArkadiaPeopleDB`, `ArkadiaHerbsDB`, `ArkadiaMagicsDB`,
`ArkadiaMagicKeysDB`, `ArkadiaWiedzaDB`, knowledge definitions), logs (`ArkadiaMessagesDB`,
`ArkadiaLogsMetaDB`), `ArkadiaRecordingsDB`, `ArkadiaCustomSounds`, `arkadia-sun-tracker`,
`ArkadiaPluginsDB` / `ArkadiaPluginEditorDB`.

## 5. Merge rules

Each type declares a rule per field. Timestamps are HLC stamps (section 6.2).

| Rule | Meaning | Use for | Examples |
|---|---|---|---|
| **newest** | Highest stamp wins | Things the user writes or edits: the latest version is the truth | aliases, triggers, binds, settings fields, notes, multibinds, food groups, device UI settings |
| **newest-observation** | Highest observation stamp wins | A snapshot of state the game reported | wiedza entry lists per category, deposits, containers, enemy resistances, złom items, `expectedDuration` of a transport segment |
| **earliest** | Lowest stamp wins | An observed transition: the first device that saw it saw it happen, later devices only noticed | knowledge `level_change` (per character/category/level), oswajanie level-up (per character/animal/level), "first visited at" |
| **union** | Set union by id; the same fact from two devices is one element | Facts that are either observed or not | visited rooms, ticks, profession events, people edits, deliveries, feeding entries |
| **counter** | Each device owns one slot per item (its own contribution, **newest** within the slot); the value is the sum of slots | Counts | kills, improve counts |
| **max** / **min** | Extreme value in a declared order | Progress that only moves forward; records | library status (`not_started` < `in_progress` < `completed`), book (`in_progress` < `read`), transport `longestDuration` (max) and `shortestDuration` (min) — only the current extremes, no history |

Counters use slots rather than increments because values are detected by comparison (section 6): a
device's contribution is its local total minus the other devices' slots. Only the owner writes a slot, so
there's never a conflict, and a manual correction can lower a count.

Deletions: a delete is a tombstone `{deleted: true, stamp}` under the **newest** rule. A delete that is
newer than an edit wins, and vice versa. Only user-edited types (newest) can be deleted; accumulated types
have no reset (section 2). Toggles such as the oswajanie `active` flag are a **newest** field on the item.

Device scope: `uiSettings`, `buttons` and `radial` are one whole value per device (no field split),
**newest**, stored per origin device and applied only from devices in the same sync group (existing
`getSyncGroup` behavior).

Knowledge, concretely:

- `knowledgeLibraries`: **max** per (character, library, category).
- `knowledgeBooks`: **max** per (character, book category, book).
- `knowledgeDetails`: per (character, category) for the entry lists, unknown entries and per-source levels
  (they come from one `wiedza` output), and per character for metadata (gender). **Custom** rule: the
  reading with the newer `updatedAt` wins, so an old reading captured late (first capture after a long
  break) doesn't beat a newer one.
- `knowledgeEvents`: level changes are **earliest** per (character, category, level): a device that missed
  the level-up records it later from `wiedza` output, and that later record must not move the point from
  which ticks are counted. Ticks are **union** by id and only matter until the next level-up (section 8.3).

Oswajanie follows the same stream shape — `feed feed feed level-up feed feed level-up` — and the point is
knowing how many feedings it took between level-ups:

- Level-ups are **earliest** per (character, animal, level): the first observation is the real level-up;
  a device that only saw the new level later must not move it, or feedings in between would be counted
  toward the wrong level.
- Feedings are **union** by id. They are kept (they are the statistic), and a delivered feeding can't be
  observed twice on two devices, so no deduplication beyond the id is needed. Same for deliveries.
- The `active` flag of a feeding entry and food groups are **newest**.
- Renames (`/o_przemianuj`) are separate **newest** items (`tamingFeedingNames`, `tamingLevelNames`); the
  union and earliest items keep the name the game used, which never changes.
- Feeding and level entries use stable ids (`${deviceId}:…`); the oswajanie database upgrade (v5)
  re-keys existing auto-increment entries.

Transport segments: resetting a leg keeps the record as a marker (`resetAt`); the merge only counts
durations measured after the later reset of the two sides.

## 6. Local change tracking

Data stays where it is today: settings in localStorage (`character:key` for per-character values), large
data in the per-feature IndexedDB databases. Sync never changes how features read or write their data.
(An earlier draft moved everything into one IndexedDB store behind `TypedStorage`; rejected because 135
direct `localStorage` calls in 27 files and 43 e2e specs seeding `localStorage` would all bypass or break
it, and startup would have to await IndexedDB.)

### 6.1 Adapters and the tracking copy

- Each synced type has an **adapter**: `read()` lists the current local items (one per alias, per room,
  per character key, …) and `write(changes)` applies merged items back through the feature's own storage.
- A new IndexedDB database `ArkadiaUserData` keeps the **tracking copy**: the last known record of every
  item, with its merge metadata.

```ts
interface UserRecord {
    type: string;            // registry type, e.g. 'aliases', 'knowledgeEvents'
    scope: string;           // 'global' | `char:${name}` | `device:${deviceId}`
    key: string;             // item key within the type, e.g. alias id, room id, event id
    value?: unknown;         // absent when deleted
    deleted?: true;
    stamp: string;           // HLC, section 6.2
    origin: string;          // device id that produced this version
    seq: number;             // origin's local sequence number (for sync cursors)
}
// primary key: [type, scope, key]; index: [origin, seq]
```

### 6.2 Stamps

Hybrid logical clock: `(wallMs, counter, deviceId)`, encoded as a sortable string. Every local stamp takes
`max(now, lastStamp) + counter`, and every received record advances the local clock. This gives a total
order even with a skewed phone clock, and `deviceId` breaks ties deterministically. Rules that compare
game events (earliest level-up, ticks) use the event's own timestamp from the data where it has one.

### 6.3 Detecting changes

- **Capture** compares `read()` with the tracking copy. An item that is new or different becomes a record
  with a fresh stamp and the next local `seq`; a tracked item missing locally becomes a tombstone for
  deletable (user-edited) types, and is written back for accumulated types (no reset, section 2).
- Capture runs on every upload tick, and a type can request an immediate capture after a write (e.g.
  `TypedStorage` changes to its keys) so stamps stay close to the actual edit.
- Every write path is covered, including direct `localStorage` calls and e2e seeding.
- The **first capture** on a device seeds the tracking copy from all local data; its records are the
  one-time full upload of section 10.2.
- **Apply** merges incoming records into the tracking copy by the type's rule and writes items whose merged
  value differs from local data through the adapter.
- The **outbox** is the local device's records above the last uploaded `seq`. A local record already
  superseded by a remote one is no longer in the tracking copy and needs no upload.

## 7. Registry

One entry per type, next to the category registry (which keeps serving the v1 format and backups until
stage 5):

```ts
interface UserDataType<V> {
    id: string;
    scope: 'global' | 'character' | 'device';
    rule: MergeRule<V>;        // newest | earliest | union | counter | max/min | custom merge
    deletable?: boolean;       // user-edited types; accumulated types can't be deleted
    read(): LocalItem<V>[] | Promise<LocalItem<V>[]>;
    write(changes: ItemChange<V>[]): void | Promise<void>;
}
```

The merge is generic: `resolve(rule, a, b)` over records with the same `[type, scope, key]`.

## 8. Cloud model

The cloud side sits behind a small transport interface so Firestore can be replaced later (section 9.4):

```ts
interface SyncTransport {
    appendBatch(batch: EncryptedBatch): Promise<void>;
    subscribeLog(onLog: (log: LogDoc) => void): () => void;
    readBase(): Promise<BaseDoc>;
    fold(update: (base: BaseDoc, log: LogDoc) => { base: BaseDoc; keep: Batch[] }): Promise<void>;
    setWatching(watching: boolean): Promise<void>;
}
```

### 8.1 Firestore layout

Two documents per user, plus base overflow shards only if ever needed:

```
users/{uid}/syncV2/log     { batches: [{ device, seq, stamp, data }], watching: { [deviceId]: stamp } }
users/{uid}/syncV2/base    { schemaVersion, records, folded: { [deviceId]: seq }, shards?: string[] }
users/{uid}/syncV2/base__{n}   overflow shard, only when `base` nears 768 KiB
```

- **Log.** Every device appends its batches to the one `log` document with `arrayUnion`. The append is
  atomic on the Firestore side, so concurrent appends from two devices never overwrite each other and need
  no transaction. Each batch is small (one upload interval of changes) and encrypted on its own.
- **Base.** The compacted state of all synced types. One document: today's v1 sync document already holds
  everything under 1 MiB, and v2's base is smaller because old ticks are dropped. If it ever nears
  768 KiB, the largest types (`visitedRooms`, `kills`, `zlom`) move to overflow shards listed in
  `shards`. Consistent rule: one base document until it can't be.
- **Batching.** Pending records are uploaded immediately on `visibilitychange` (hidden) and `pagehide`,
  otherwise at most every 5 minutes while playing (every ~15 s in watching mode, 8.3). Switching devices is
  exactly when the tab you leave goes hidden, so the device you pick up already has everything. User edits
  in the options UI (a new alias, a bind) flush after a short debounce (~5 s). The outbox is persisted, so
  a phone killing a background tab loses nothing.
- **Oversized batches** (the one-time migration seed, a restore, a large settings import — anything over
  ~32 KiB) skip the log and are folded straight into `base` in a transaction (8.4).

### 8.2 Reading and listeners

- **One listener, on `log`.** Whatever changes, a device re-reads one document. A resume after any gap
  costs 1 read, like today.
- **Cursors.** Each device keeps, locally, the last applied `seq` per origin device. On every log snapshot
  it applies batches from other devices above that cursor through `resolve`, and ignores its own.
- **Behind a compaction.** If `base.folded[device]` is above a local cursor, batches this device never saw
  were folded away: it reads `base` once, merges it, and moves its cursors to the watermarks. That's the
  only time `base` is read besides first start.
- **Detach on hide.** When the tab becomes hidden: flush the outbox, clear the watching flag, unsubscribe.
  When it becomes visible: re-subscribe. A hidden tab doesn't need live updates, a throttled background
  tab doesn't retry in a loop (battery), and each return costs the same 1 read whether the gap was
  2 minutes or 2 days.
- **One listener per browser.** Only the tab holding the sync Web Lock (as `syncEngine` does today)
  listens and uploads. Other tabs see applied localStorage values through the browser's `storage` event;
  IndexedDB-backed types notify them over a `BroadcastChannel`.
- **Open tabs must reflect applied records:** feature stores and scripts with in-memory copies (knowledge
  script, `DataStore` caches, the knowledge events cache, the złom cache) reload when their adapter writes. Stage 2 audits every such cache.
- **Duplicates don't matter.** A batch delivered twice (overlapping resume, two snapshots) resolves to the
  same result: records are keyed and stamped, and every rule is idempotent. Delivery affects timing and
  cost, never correctness.

### 8.3 Watching mode

For following one device from another (e.g. improvements on the PC, watched on the phone):

- A visible, listening device sets `log.watching[deviceId]` on show and removes it on hide (one write
  each).
- The playing device already receives `log` snapshots, so it sees whether another of the user's devices is
  watching. While one is, it uploads every ~15 s instead of every 5 minutes.
- When the phone's screen turns off, its tab goes hidden, the flag is cleared, and the PC falls back to the
  5-minute interval. Stale flags (tab killed without `pagehide`) expire after 10 minutes by stamp.

### 8.4 Compaction

- When `log` exceeds ~64 KiB, any device runs `fold` in one Firestore transaction: read `log` and `base`,
  resolve all log batches into `base`, advance `folded[device]` for each origin, and rewrite `log` without
  the folded batches. An append arriving during the transaction makes it retry; nothing is lost.
- Every rule is order-independent and each batch is folded once (the watermark), so plain sums are safe
  for counters, and two devices compacting at the same time only cause a retry.
- Type-specific policies run during folding. `knowledgeEvents`: ticks at or before the latest level change
  of their category are dropped; level changes are kept (they're few and give the history). Tombstones
  older than the compaction horizon (90 days) are dropped.
- `watching` entries older than 10 minutes are removed.
- A device that comes back after a long time reads `base` (it's behind the compaction) and uploads only its
  outbox (changes it made since its last upload). It never re-uploads full state, so it can't bring back
  deleted items.

### 8.5 Encryption

Each batch and the base (and any overflow shard) are encrypted as a unit with the passphrase
(`firebaseCrypto`). Device ids and seq numbers stay in plaintext; they carry no user content.

## 9. Firebase cost

### 9.1 Free tier (Spark), per project per day — shared by all users

Firestore: 50,000 document reads, 20,000 writes, 20,000 deletes, 1 GiB stored, 10 GiB/month outbound
transfer. These are counted per document operation, not per byte or per event, and they are **totals for
the whole project**, so every figure below must be multiplied by the number of active players.

How listeners are billed:

| Situation | Reads |
|---|---|
| Listener attached, nothing changes | 0 |
| The watched document changes | 1 per listening device |
| Listener starts (page load, re-attach after hide) | 1 per matched document (minimum 1) |
| Connection resumes within ~30 min | only changed documents |
| Connection resumes after ~30 min | like a fresh start |

With a single watched document, every row costs at most 1 read.

### 9.2 Current load (Firebase console, ~50 syncing users, some irregular)

| Period | Reads | Writes |
|---|---|---|
| Last week (console figure, −38.5 % / −52.4 % vs. the week before) | 808 | 303 |
| Today | ~1,100 | ~400 |

Peak concurrent snapshot listeners today: 18 (listeners cost nothing while idle).

That's about 2 % of the daily read quota and 2 % of the write quota — lots of headroom, but also a baseline
v2 must not blow up.

### 9.3 Estimate

- **Writes count per document write, not per change.** Batching is what keeps it cheap.
- **Every write is a read on each other listening device**, and detached (hidden) devices don't pay it.
- **Listeners download the whole changed document**, which is why `log` is compacted at ~64 KiB.

Per active player-session of ~2 hours: ~24 interval uploads + a few flushes on hide/close + options edits
≈ 30 writes; 1 read per upload per other visible device; 1 read per tab show; a compaction now and then
(1 transaction: 2 reads, 2 writes). Watching mode adds up to 4 writes a minute, only while two devices are
visible at once. For 50 users that's roughly 1,500–2,500 writes and 2,000–4,000 reads on a busy day: a few
times today's load (today knowledge and other IndexedDB data barely sync, and most syncs are skipped as
unchanged), still under 15 % of the free tier. Stage 3 adds counters (writes, reads, bytes per session) to
confirm it before rollout; the intervals are the knobs if it's higher than expected.

Today, by comparison, any localStorage write (including `mapperRoomId` on every move) schedules a sync
30 s later, each sync that finds changes writes whole category blobs in a transaction, and every listener
re-downloads the whole (up to 1 MiB) sync document on any change. v2 sends only changed records and
listeners download a log of at most ~64 KiB.

### 9.4 If we outgrow the free tier

- **Firestore Blaze (pay as you go):** same code, billed per operation beyond the free quota; at these
  volumes a small monthly cost.
- **Cloudflare:** the repo already deploys a Worker (`worker/`). A Durable Object per user could hold the
  log and compact server-side, verifying Firebase Auth tokens. More work; only worth it if Firestore costs
  become real.

The `SyncTransport` interface (section 8) keeps either move contained.

## 10. Migration

### 10.1 Local (stage 2)

Nothing moves. The first capture seeds the tracking copy from the data where it already is. Oswajanie
feeding and level entries get stable ids (`${deviceId}:${n}`) instead of their auto-increment keys, which
would collide across devices.

### 10.2 Cloud (stage 5)

1. The first v2 client of an account imports the v1 document (`users/{uid}/sync/{SYNC_DATA_DOC}`) through
   the registry's `legacy.importV1` and the normal merge, then writes `base`.
2. **Every** v2 device then folds its full local state into `base` once (an oversized batch, 8.1; the
   only full upload ever). The merge combines it with the base, so data that never reached v1 (e.g.
   knowledge stuck in conflict) propagates. This is why the current knowledge problem fixes itself.
3. **Old app versions.** There's no central server, but tabs keep running the old code until reloaded
   (a PC tab can stay open for days), and they keep writing the v1 document. For a grace period of
   **one month** v2 clients also merge later v1 updates in (one direction), and the old code sees a
   `schemaVersion` flag in the v1 document and shows "reload to update". After the window, Firestore
   security rules deny writes to the v1 document — that's the central enforcement point we do have.
4. Then v1 reading, `planSync`, `categorySyncChecksums`, the conflict UI and the v1 document are removed.

## 11. Backup

Sync keeps devices converged; a backup is a way back in time. Those are different, and restoring interacts
with sync in one important way: if a restored device simply writes old values locally, every other device
still holds newer-stamped records and the next sync silently undoes the restore.

- **Export** writes a file with all records of all synced types (same serializer as sync). Google Drive
  is just another place to put the file.
- **Restore** replaces local data with the file and publishes it as new changes: every record in the file
  is rewritten with a fresh stamp, and every current record not in the file gets a fresh tombstone. Other
  devices converge to the backup. Shown with a clear confirmation ("this replaces data on all your
  devices").
- For accumulated types without deletes (knowledge, kills, visited rooms, …), restore replaces the local
  values with the backup's and publishes them with **newest** priority for that one operation, via a
  restore epoch per type recorded in the batch. Devices apply the epoch by discarding their older records
  of that type. This is the only place an epoch exists; there's no user-facing reset.
- No "merge import": a merge is what sync already does.

## 12. What gets removed from the UI

- Per-category sync checkboxes (`syncOptions`), export options (`ExportOptions`), the character picker and
  the conflict dialog.
- Remaining sync settings: on/off, encryption passphrase, sync group / device management.
- Backup: export file, restore from file, Google Drive upload/download.

## 13. Stages

Each stage is shippable on its own and keeps the app working.

| # | Stage | Contents | Done when |
|---|---|---|---|
| 1 | Registry and serializer | One registry, one export/import path for Firebase, Drive and files; remove `syncOptions`, `ExportOptions`, character picker. Cloud format unchanged. | `buildExport` / `exportCategories` are one path; options UI shows no per-category choices; existing sync unaffected |
| 2a | Change tracking core | HLC, `ArkadiaUserData` tracking copy, merge rules, capture / apply / outbox, adapters for the localStorage-backed types | Rule and capture/apply tests green for those types; no behavior change; e2e green |
| 2b | IndexedDB-backed types | Adapters for knowledge, kills, visited rooms, notes, multibinds and the five newly synced stores; stable oswajanie ids; cache audit so applied records refresh open tabs | Every type in 4.1 has an adapter with round-trip tests; e2e green |
| 3 | Sync engine v2 | `SyncTransport` on Firestore: `log` + `base`, outbox, batching, one listener with cursors and detach on hide, watching mode, compaction, encryption, usage counters — behind a flag | Two-device e2e (section 15) converges with the flag on; measured ops per session fit section 9.3 |
| 4 | Types on v2 | Knowledge first, then kills, visited rooms, profession, notes, multibinds, the five new stores, then settings types with `diff` | Each type round-trips through v2 with its rule tests |
| 5 | Cloud migration, backup, cleanup | v1 import, one-time seed per device, one-way bridge, v1 write lock in security rules, restore with epochs, then removal of v1 code and conflict UI | Flag removed; v1 code deleted after the window |

## 14. Decisions

Settled:

- No reset of accumulated data.
- Backup is separate from sync; restore publishes to all devices (section 11).
- Ticks only matter until the next level-up; older ticks are dropped at compaction.
- Newly synced: oswajanie (level-ups earliest, feedings union), enemy resistances (newest observation),
  złom (newest observation), transport stats (current min/max only), delivery stats (union).
- Old-version grace period: one month.
- Library and book progress only moves forward (**max**). A manual reset or unmark in the Wiedza window is
  undone by sync; acceptable because progress only goes back after a bug. A correction marker that beats
  automatic progress can be added if needed.
- Only one device can be attached to a game session, so an event (tick, kill, feeding, delivery) is never
  observed on two devices at once and needs no deduplication beyond its key.
- Batch interval during play: 5 minutes, immediate flush when the tab is hidden or closed.
- Cloud layout: one shared `log` document (atomic appends) and one `base` document per user; overflow
  shards only if `base` nears the size limit.
- One listener per browser, on `log` only, detached while the tab is hidden.
- Watching mode: ~15 s uploads while another of the user's devices is visible.
- Not synced: sun tracker, plugins (possible separate API later).
- Device UI settings stay one whole value per device.
- Stay on the Firebase free tier; transport kept replaceable.

Old-version notice (Polish, no diacritics, like the other sync strings in `@modules/firebase`):

- During the grace period, shown once per page load as a toast that stays until dismissed, with an
  "Odswiez" button that reloads the page:
  **"Synchronizacja zostala zaktualizowana. Odswiez strone, aby dalej synchronizowac dane z innymi urzadzeniami."**
- After the grace period, when a v1 write is denied by the security rules:
  **"Ta wersja klienta nie synchronizuje juz danych. Odswiez strone, aby wczytac nowa wersje."**

Nothing left open.

## 15. Testing

- **Rule tests** (Vitest): for every rule and type, randomized record sets checking that merge is
  commutative, associative and idempotent, and that folding into base then reading equals reading the raw
  log.
- **Adapter tests:** for every type, capture from fixture profiles (including `character:key` data for
  several characters and every legacy database), apply of remote records, and read-after-write round
  trips.
- **Two-device e2e** (Playwright, two browser contexts sharing a mocked Firestore via
  `e2e/support/firebase-fixtures.ts`): both tabs open and writing at the same time; one tab stale for a
  while and then editing; a phone-style tab killed with pending changes and reopened. Assert identical
  state on both sides and that the stale tab didn't overwrite newer data.
- **Compaction e2e:** push the log past the threshold, compact concurrently from two contexts while both
  append, assert no
  loss and no double-counted kills.
- **Migration e2e:** start from a v1 cloud document plus divergent local data on two devices; assert the
  union after both upgrade.
- **Restore e2e:** restore a backup on one context; assert the other context converges to the backup.
- **Watching mode e2e:** one context visible and watching, the other playing; assert the short interval
  applies and ends when the watcher hides.
- **Usage counters:** assert operations per simulated session stay within the section 9.3 budget.

## 16. Risks

- **Capture cost:** reading every type on each tick. Mitigation: ticks are minutes apart; per-type
  capture on write for the hot paths; measure on a large profile in stage 2.
- **Missed in-memory caches** showing stale data in open tabs. Mitigation: the cache audit in stage 2 and a
  store-level subscription used by every feature store.
- **Free-tier quotas are shared by all users.** Mitigation: batching, one watched document, log compaction,
  usage counters in stage 3 compared against the section 9.2 baseline, and the replaceable transport.
- **Clock skew** handled by HLC; a device with a wildly wrong clock can still win **newest** ties for a
  while. Mitigation: clamp stamps that are far in the future relative to the server timestamp of the upload.
