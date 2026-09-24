# Sync v2 — plan

Dev-facing. `docs/` root is user-facing (see `docs/SYNCHRONIZACJA.md`); this file is deliberately in `docs/dev/`.

Status: **proposal, not started.** Replaces the category/checksum sync in `src/modules/firebase/` and the
`character:key` localStorage layout for user data.

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
2. **Each device writes only its own log.** No two devices write the same Firestore document during normal
   sync, so there are no transactions and no conflicts.
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
| **sum** | Sum of increments, each folded exactly once | Counts | kills, improve counts |
| **max** / **min** | Extreme value in a declared order | Progress that only moves forward; records | library status (`not_started` < `in_progress` < `completed`), book (`in_progress` < `read`), transport `longestDuration` (max) and `shortestDuration` (min) — only the current extremes, no history |

Deletions: a delete is a tombstone `{deleted: true, stamp}` under the **newest** rule. A delete that is
newer than an edit wins, and vice versa. Only user-edited types (newest) can be deleted; accumulated types
have no reset (section 2). Toggles such as the oswajanie `active` flag are a **newest** field on the item.

Device scope: `uiSettings`, `buttons` and `radial` are one whole value per device (no field split),
**newest**, stored per origin device and applied only from devices in the same sync group (existing
`getSyncGroup` behavior).

Knowledge, concretely:

- `knowledgeLibraries`: **max** per (character, library, category).
- `knowledgeBooks`: **max** per (character, book category, book).
- `knowledgeDetails`: **newest-observation** per (character, category) for the entry lists, unknown entries
  and per-source levels (they come from one `wiedza` output); **newest** for character metadata (gender).
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

## 6. Local storage model

### 6.1 One user-data store

A single IndexedDB database `ArkadiaUserData` with one object store:

```ts
interface UserRecord {
    type: string;            // registry type, e.g. 'aliases', 'knowledgeEvents'
    scope: string;           // 'global' | `char:${name}` | `device:${deviceId}`
    key: string;             // item key within the type, e.g. alias id, room id, event id
    value: unknown;          // absent when deleted
    deleted?: true;
    stamp: string;           // HLC, section 6.2
    origin: string;          // device id that produced this version
    seq: number;             // origin's local sequence number (for sync cursors)
}
// primary key: [type, scope, key]; indexes: [origin, seq], [type, scope]
```

- Replaces `character:key` in localStorage and the per-feature IndexedDB databases in 4.1. The character
  is an explicit `scope`, not a key prefix to parse.
- New event ids are `${deviceId}:${seq}`, unique across devices without coordination.
- `TypedStorage` / `characterStorage` / `globalStorage` keep their API and become a façade over an
  in-memory cache of this store, loaded once at startup, writing through. Call sites don't change.
- Feature stores keep their public functions but read and write through the user-data store instead of
  their own databases.
- Cross-tab propagation moves from the localStorage `storage` event to a `BroadcastChannel`.
- localStorage keeps only what must be readable synchronously before startup: device id, current
  character, theme (avoids a flash), the "user-data store ready" flag. Non-synced runtime state
  (`mapperRoomId` and similar) can stay in localStorage and never touches sync.

Startup: the web app awaits `userData.load()` before `registerScripts`. Stage 2 must measure this on a
large profile (target: under 100 ms for a typical user) and on phones.

### 6.2 Stamps

Hybrid logical clock: `(wallMs, counter, deviceId)`, encoded as a sortable string. Every local write takes
`max(now, lastStamp) + counter`, and every received record advances the local clock. This gives a total
order even with a skewed phone clock, and `deviceId` breaks ties deterministically.

### 6.3 Recording changes

- Settings in localStorage today: `TypedStorage.set(key, next)` knows the previous value; the type's
  `diff(prev, next)` produces per-item records (e.g. only the alias that changed). Scripts need no changes.
- Event-like data (ticks, kills, visits, deliveries, feedings): the feature store writes one record per
  event, with the event id as key.
- Every local write bumps `seq` and marks the record pending upload (the outbox is the `[origin, seq]`
  index filtered to the local device, above the last uploaded seq).

## 7. Registry

One entry per type replaces `CATEGORY_REGISTRY` and the `switch` blocks in `exportUtils`:

```ts
interface SyncedType<V> {
    id: string;
    scope: 'global' | 'character' | 'device';
    rule: MergeRule | Record<string, MergeRule>;   // per field when the value is an object
    diff?(prev: V | undefined, next: V | undefined): Array<{ key: string; value?: V; deleted?: true }>;
    compact?: CompactionPolicy;                    // e.g. drop ticks before the last level change
    legacy?: { localStorageKey?: string; characterKey?: string; importV1?(raw: string): UserRecord[] };
}
```

The merge is generic: `resolve(rule, a, b)` over records with the same `[type, scope, key]`.

## 8. Cloud model

The cloud side sits behind a small transport interface so Firestore can be replaced later (section 9.4):

```ts
interface SyncTransport {
    appendBatch(batch: EncryptedBatch): Promise<void>;          // own device only
    subscribe(fromCursors: Cursors, onBatch: (b: EncryptedBatch) => void): () => void;
    readBase(): Promise<BaseState>;
    compact(fold: (base: BaseState) => BaseState): Promise<void>;
}
```

### 8.1 Firestore layout

```
users/{uid}/syncV2/meta                                 { schemaVersion, devices: {id: lastSeenAt} }
users/{uid}/syncV2/segments/{deviceId}__{segmentNo}     { device, fromSeq, toSeq, batches[] }
users/{uid}/syncV2/base/{shard}                         { records[], folded: { [deviceId]: seq } }
```

- **Segments.** A device appends batches to its current segment document (`arrayUnion`, so only the new
  batch is sent). When a segment reaches ~64 KiB it starts the next one. Segments are small on purpose:
  every update delivers the whole segment to listening devices (section 9.3).
- **Batching.** Pending records are uploaded immediately on `visibilitychange` (hidden) and `pagehide`,
  otherwise at most every 5 minutes while playing. Switching devices is exactly when the tab you leave
  goes hidden, so the device you pick up already has everything — the long interval only matters when
  both are actively used at once. User edits in the options UI (a new alias, a bind) flush after a short
  debounce (~5 s). The outbox is persisted, so a phone killing a background tab loses nothing.
- **Base shards.** Few and coarse, to keep startup reads low: `global` (all small global types),
  `char__{name}` per character, and separate shards only for types that can grow large (`visitedRooms`,
  `kills`, `zlom`) — split further only if a shard nears 512 KiB.

### 8.2 Reading

- The realtime listener watches `syncV2/segments` for documents from other devices with `toSeq` above the
  local cursor for that device, and applies their records through `resolve`.
- Records at or below `base.folded[deviceId]` are skipped; they're already in the base.
- A new device, or one far behind, reads the base shards first, then the remaining segments.
- Open tabs must reflect applied records: feature stores and scripts with in-memory copies (knowledge
  script, `DataStore` caches, the knowledge events cache, the złom cache) subscribe to the user-data store
  and reload. Stage 2 audits every such cache.

### 8.3 Compaction

- When a device has more than ~4 closed segments, it folds them into the base shards in a Firestore
  transaction, advances `folded[deviceId]`, then deletes those segments.
- Every rule is order-independent and each record is folded once (the watermark), so plain sums are safe
  for counters, and two devices compacting at the same time only cause a transaction retry.
- Type-specific policies run during folding. `knowledgeEvents`: ticks at or before the latest level change
  of their category are dropped; level changes are kept (they're few and give the history). Tombstones
  older than the compaction horizon (90 days) are dropped.
- Segments of devices silent for longer than the horizon are folded by any device and the device is removed
  from `meta.devices`.
- A device that comes back after longer than the horizon only uploads its outbox (changes it made since its
  last upload). It never re-uploads full state, so it can't bring back deleted items.

### 8.4 Encryption

Each batch and each base shard is encrypted as a unit with the passphrase (`firebaseCrypto`). Document ids
carry no user content (device ids, segment numbers, character shard names are hashed when encryption is on).

## 9. Firebase cost

### 9.1 Free tier (Spark), per project per day — shared by all users

Firestore: 50,000 document reads, 20,000 writes, 20,000 deletes, 1 GiB stored, 10 GiB/month outbound
transfer. These are counted per document operation, not per byte or per event, and they are **totals for
the whole project**, so every figure below must be multiplied by the number of active players.

### 9.2 Current load (Firebase console, ~50 syncing users, some irregular)

| Period | Reads | Writes |
|---|---|---|
| Last week (console figure, −38.5 % / −52.4 % vs. the week before) | 808 | 303 |
| Today | ~1,100 | ~400 |

That's about 2 % of the daily read quota and 2 % of the write quota — lots of headroom, but also a baseline
v2 must not blow up.

### 9.3 Is "write each change once" enough?

Mostly yes, with three corrections:

1. **Writes count per document write, not per change.** Writing each tick or kill as its own document
   would multiply writes by the number of events. Batching many changes into one segment update is what
   keeps it cheap.
2. **Every write is also a read on each other listening device.** With a PC and a phone both open, each
   batch costs 1 write + 1 read.
3. **Listeners re-download the whole updated document.** That's why segments are capped at ~64 KiB instead
   of one growing log per device.

Per active player-session of ~2 hours with the batching in 8.1: ~24 interval batches + a few flushes on
hide/close + options edits ≈ 30 writes, similar reads on the other device, and 5–15 reads per device
start. For 50 users that's roughly 1,500 writes and 2,000–3,000 reads on a busy day: a few times today's
load (today, knowledge and other IndexedDB data barely sync, and most syncs are skipped as unchanged),
still under 10 % of the free tier. Stage 3 adds counters (writes, reads, bytes per session) to confirm it
before rollout; the 5-minute interval is the knob if it's higher than expected.

Today, by comparison, any localStorage write (including `mapperRoomId` on every move) schedules a sync
30 s later, and each sync that finds changes writes whole category blobs in a transaction. v2 sends only
changed records of synced types, so bytes per sync drop a lot even where operation counts rise.

### 9.4 If we outgrow the free tier

- **Firestore Blaze (pay as you go):** same code, billed per operation beyond the free quota; at these
  volumes a small monthly cost.
- **Cloudflare:** the repo already deploys a Worker (`worker/`). A Durable Object per user could hold the
  log and compact server-side, with no read amplification between devices, verifying Firebase Auth tokens.
  More work; only worth it if Firestore costs become real.

The `SyncTransport` interface (section 8) keeps either move contained.

## 10. Migration

### 10.1 Local (stage 2)

On first start, `migrateToUserData()` reads every legacy source in 4.1 (localStorage keys and the
per-feature databases) and writes records stamped with the migration time and the local device id. Old
sources are kept read-only for one release, then deleted. Idempotent: guarded by the ready flag, and
records are keyed, so a rerun overwrites with identical values.

### 10.2 Cloud (stage 5)

1. The first v2 client of an account imports the v1 document (`users/{uid}/sync/{SYNC_DATA_DOC}`) through
   the registry's `legacy.importV1` and the normal merge, then writes base shards.
2. **Every** v2 device then uploads its full local state once as its first batch (the only full upload
   ever). The merge combines it with the base, so data that never reached v1 (e.g. knowledge stuck in
   conflict) propagates. This is why the current knowledge problem fixes itself.
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
| 2 | User-data store | `ArkadiaUserData`, HLC, `TypedStorage` façade, feature stores ported (including the five newly synced stores), stable oswajanie ids, `BroadcastChannel`, local migration, cache audit | All synced types read/write through the store; startup cost measured; e2e green |
| 3 | Sync engine v2 | `SyncTransport` on Firestore: segments, outbox, batching, listener with cursors, base shards, compaction, encryption, usage counters — behind a flag | Two-device e2e (section 15) converges with the flag on; measured ops per session fit section 9.3 |
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
- Batch interval during play: 5 minutes, immediate flush when the tab is hidden or closed.
- Not synced: sun tracker, plugins (possible separate API later).
- Device UI settings stay one whole value per device.
- Stay on the Firebase free tier; transport kept replaceable.

Open:

1. Wording of the "reload to update" notice for old versions.

## 15. Testing

- **Rule tests** (Vitest): for every rule and type, randomized record sets checking that merge is
  commutative, associative and idempotent, and that folding into base then reading equals reading the raw
  segments.
- **Store tests:** `TypedStorage` façade parity with the current localStorage behavior; local migration from
  fixture profiles (including `character:key` data for several characters and every legacy database).
- **Two-device e2e** (Playwright, two browser contexts sharing a mocked Firestore via
  `e2e/support/firebase-fixtures.ts`): both tabs open and writing at the same time; one tab stale for a
  while and then editing; a phone-style tab killed with pending changes and reopened. Assert identical
  state on both sides and that the stale tab didn't overwrite newer data.
- **Compaction e2e:** push segments past the threshold, compact concurrently from two contexts, assert no
  loss and no double-counted kills.
- **Migration e2e:** start from a v1 cloud document plus divergent local data on two devices; assert the
  union after both upgrade.
- **Restore e2e:** restore a backup on one context; assert the other context converges to the backup.
- **Usage counters:** assert operations per simulated session stay within the section 9.3 budget.

## 16. Risks

- **Startup latency** from awaiting the user-data store, especially on phones. Mitigation: measure in stage
  2; keep boot-critical values in localStorage.
- **Missed in-memory caches** showing stale data in open tabs. Mitigation: the cache audit in stage 2 and a
  store-level subscription used by every feature store.
- **Free-tier quotas are shared by all users.** Mitigation: batching, small segments, coarse base shards,
  usage counters in stage 3 compared against the section 9.2 baseline, and the replaceable transport.
- **Clock skew** handled by HLC; a device with a wildly wrong clock can still win **newest** ties for a
  while. Mitigation: clamp stamps that are far in the future relative to the server timestamp of the upload.
