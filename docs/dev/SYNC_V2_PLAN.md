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
  localStorage write happens to trigger a sync.
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
- One registry entry per data type defines storage, merge rules, sync and export. Adding a type is one entry.
- No per-category or per-character selection. Everything user-owned syncs; export is a full backup.
- Bounded cloud storage: logs are compacted, no document approaches 1 MiB.
- Existing users migrate automatically, including data that never synced (e.g. knowledge).

Non-goals:

- Real-time collaborative editing of the same item (newest-wins per item is enough).
- Syncing reference data downloaded from GitHub (map, NPCs, people, herbs, magics, knowledge/wiedza
  definitions). It stays a local cache.
- Syncing logs, recordings, custom sounds (large, device-local).

Known and accepted: until stage 4 ships, knowledge does not sync reliably. The migration seeds from each
device's local data (section 9), so nothing is lost in the meantime.

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

## 4. Data inventory

### 4.1 Synced today

| Current category | Current storage | v2 type(s) |
|---|---|---|
| `binds` (`binds`, `keymaps`) | localStorage global | `binds` (map, per key combo) |
| `shortcuts` | localStorage global | `shortcuts` (map, per id) |
| `triggers`, `aliases` | localStorage global | `triggers`, `aliases` (map, per id) |
| `automationGroups`, `automationScripts` | localStorage global | same (map, per id) |
| `shellSettings`, `renderSettings`, `mapSettings`, `behaviorSettings` | localStorage global | same (map, per field) |
| `characterSettings` | all `character:key` entries, one blob | split into the character-scoped types it contains; the profession CRDT (`mergeProfessionStates`) becomes the `profession` event type |
| `improveCounts` | `character:improve_counter_lifetime` | `improveCounts` (counter) |
| `deposits`, `containers` | `character:deposits`, `character:containers` | same (server observation) |
| `peopleEdits` | `character:peopleLocalEvents` | `peopleEdits` (event set; already event-based) |
| `killCounts` | `ArkadiaKillsDB` (+ legacy `character:kill_counter`) | `kills` (counter per character/mob/day) |
| `visitedRooms` | `ArkadiaVisitedRoomsDB` | `visitedRooms` (set per character) |
| `locationNotes` | `ArkadiaLocationNotesDB` | `locationNotes` (map, per room id) |
| `multibinds` | `ArkadiaMultibindsDB` | `multibinds` (map, per room + index) |
| `knowledge` | `ArkadiaKnowledgeDB` (library/book progress), `ArkadiaKnowledgeDetailsDBv*` (entries, levels, character metadata), `ArkadiaKnowledgeEventsDB` (ticks, level changes) | `knowledgeLibraries`, `knowledgeBooks`, `knowledgeDetails`, `knowledgeEvents` — split so each field gets its own rule |
| `uiSettings`, `buttons`, `radial` | localStorage global (`mobileButtonSettings`, `desktopButtonSettings`, …) | device-scoped (section 5), applied only from the same sync group |

### 4.2 User data not synced today — decide per store (section 12)

Collected from play, currently device-local: `oswajanie`, `ArkadiaEnemyResistances`, `ArkadiaZlom`,
`ArkadiaTransportStatsDB`, `ArkadiaDeliveryStats`, `arkadia-sun-tracker`. Also `ArkadiaPluginsDB` /
`ArkadiaPluginEditorDB` (installed plugins, user-written plugin code).

### 4.3 Never synced

Reference caches (`ArkadiaMapDB`, `ArkadiaNpcDB`, `ArkadiaPeopleDB`, `ArkadiaHerbsDB`, `ArkadiaMagicsDB`,
`ArkadiaMagicKeysDB`, `ArkadiaWiedzaDB`, knowledge definitions), logs (`ArkadiaMessagesDB`,
`ArkadiaLogsMetaDB`), `ArkadiaRecordingsDB`, `ArkadiaCustomSounds`.

## 5. Merge rules

Each type declares a rule per field. Timestamps are HLC stamps (section 6.2).

| Rule | Meaning | Use for | Examples |
|---|---|---|---|
| **newest** | Highest stamp wins | Things the user writes or edits: the latest version is the truth | aliases, triggers, binds, settings fields, notes, multibinds |
| **newest-observation** | Highest observation stamp wins | A snapshot of state the game server reported | wiedza entry lists per category, deposits, containers |
| **earliest** | Lowest stamp wins | An observed transition: the first device that saw it saw it happen, later devices only noticed | `level_change` ("reached level X" per character/category), "first visited at", "book read at" |
| **union** | Set union by id; the same fact from two devices is one element | Facts that are either observed or not | visited rooms, ticks (id = device + seq), profession events, people edits |
| **sum** | Sum of increments, each increment folded exactly once | Counts | kills, improve counts |
| **max** | Highest value in a declared order | Progress that only moves forward | library status (`not_started` < `in_progress` < `completed`), book (`in_progress` < `read`) |

Rules for deletion and scope:

- **Deletions** are tombstones: `{deleted: true, stamp}` under the same rule as the value. A delete that is
  newer than an edit wins, and vice versa. Tombstones are dropped at compaction once older than the
  compaction horizon.
- **Resets** (for `max`, `sum`, `union` types, if we support them) are an epoch record per scope with
  **newest** semantics. Values stamped before the epoch are ignored.
- **Device scope.** Device-scoped types (`uiSettings`, `buttons`, `radial`) are stored per origin device
  and applied only from devices in the same sync group (existing `getSyncGroup` behavior).

Knowledge, concretely:

- `knowledgeLibraries`: **max** per (character, library, category).
- `knowledgeBooks`: **max** per (character, book category, book).
- `knowledgeDetails`: **newest-observation** per (character, category) for the entry lists, unknown entries
  and per-source levels (they come from one `wiedza` output); **newest** for character metadata (gender).
- `knowledgeEvents`: ticks are **union** by id. Level changes are **earliest** per
  (character, category, level): a device that missed the level-up records it later from `wiedza` output,
  and that later record must not move the point from which "ticks since last level" are counted.

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
- `TypedStorage` / `characterStorage` / `globalStorage` keep their API and become a façade over an
  in-memory cache of this store, loaded once at startup, writing through. Call sites don't change.
- Feature stores (knowledge, kills, visited rooms, notes, multibinds) keep their public functions but read
  and write through the user-data store instead of their own databases.
- Cross-tab propagation moves from the localStorage `storage` event to a `BroadcastChannel`.
- localStorage keeps only what must be readable synchronously before startup: device id, current
  character, theme (avoids a flash), the "user-data store ready" flag.

Startup: the web app awaits `userData.load()` before `registerScripts`. Stage 2 must measure this on a
large profile (target: under 100 ms for a typical user) and on phones.

### 6.2 Stamps

Hybrid logical clock: `(wallMs, counter, deviceId)`, encoded as a sortable string. Every local write takes
`max(now, lastStamp) + counter`, and every received record advances the local clock. This gives a total
order even with a skewed phone clock, and `deviceId` breaks ties deterministically.

### 6.3 Recording changes

- Settings in localStorage today: `TypedStorage.set(key, next)` knows the previous value; the type's
  `diff(prev, next)` produces per-item records (e.g. only the alias that changed). Scripts need no changes.
- Event-like data (ticks, kills, visits): the feature store writes one record per event, with the event
  id as key.
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
    compact?: CompactionPolicy;                    // e.g. fold ticks older than N days into daily counts
    legacy?: { localStorageKey?: string; characterKey?: string; importV1?(raw: string): UserRecord[] };
}
```

The merge is generic: `resolve(rule, a, b)` over records with the same `[type, scope, key]`.

## 8. Cloud model

### 8.1 Layout

```
users/{uid}/syncV2/meta                         { schemaVersion, compactionHorizon }
users/{uid}/syncV2/devices/{deviceId}           { seq, records[] }   // own log, capped
users/{uid}/syncV2/base/{type}__{scopeShard}    { records[], folded: { [deviceId]: seq } }
```

- A device appends to its own log only. Batches are uploaded every few seconds while records are pending,
  and on `visibilitychange` (hidden) and `pagehide`. The outbox is persisted, so a phone killing a
  background tab loses nothing.
- Base documents are sharded per type and per character (`scopeShard`) so each stays well under 1 MiB.

### 8.2 Reading

- The realtime listener watches `syncV2/devices`. For each other device it keeps a cursor (last applied
  `seq`) and applies records above it through `resolve`.
- Records at or below `base.folded[deviceId]` are skipped; they're already in the base.
- A new device (or one far behind) reads the base documents first, then the logs.
- Open tabs must reflect applied records: feature stores and scripts with in-memory copies (knowledge
  script, `DataStore` caches, the knowledge events cache, zlom cache) subscribe to the user-data store and
  reload. Stage 2 audits every such cache.

### 8.3 Compaction

- When a device's log passes ~500 records or ~256 KiB, that device folds its log into the base documents in
  a Firestore transaction, sets `folded[deviceId] = lastSeq`, then trims its log.
- Because every rule is order-independent and each record is folded once (the watermark), plain sums are
  safe for counters and two devices compacting at the same time only cause a transaction retry.
- Type-specific policies run during folding. For `knowledgeEvents`: keep ticks detailed since the last
  level change per category and within a recent window (default 30 days, see section 12); fold older ticks
  into daily counts per (character, category). Drop tombstones older than `compactionHorizon`.
- Logs of devices that have been silent for longer than the horizon are folded by any device and removed
  from the device list.

### 8.4 Encryption

Unchanged in principle: each log batch and each base document is encrypted as a unit with the passphrase
(`firebaseCrypto`). Keys and ids stay in plaintext only where Firestore needs them (document ids), and
those carry no user content.

## 9. Migration

### 9.1 Local (stage 2)

On first start, `migrateToUserData()` reads every legacy source in 4.1 (localStorage keys and the
per-feature databases) and writes records stamped with the migration time and the local device id. Old
sources are kept read-only for one release, then deleted. Idempotent: guarded by the ready flag, and
records are keyed, so a rerun overwrites with identical values.

### 9.2 Cloud (stage 5)

1. The first v2 client of an account imports the v1 document (`users/{uid}/sync/{SYNC_DATA_DOC}`) through
   the registry's `legacy.importV1` and the normal merge, then writes base documents.
2. **Every** v2 device then uploads its full local state once as its first log batch. The merge combines
   it with the base, so data that never reached v1 (e.g. knowledge stuck in conflict) propagates. This is
   why the current knowledge problem fixes itself.
3. For one release window, v2 clients also read later updates to the v1 document written by old clients
   and merge them in (one direction). Old clients keep working but don't see v2 changes.
4. After the window, v1 reading, `planSync`, `categorySyncChecksums`, conflict UI and the v1 document are
   removed.

## 10. What gets removed from the UI

- Per-category sync checkboxes (`syncOptions`), export options (`ExportOptions`), the character picker and
  the conflict dialog.
- Remaining sync settings: on/off, encryption passphrase, sync group / device management.
- File export and Google Drive use the same serializer as Firebase: all records of all synced types.
- Importing a file merges (as if from another device); it doesn't replace. See section 12 for "restore".

## 11. Stages

Each stage is shippable on its own and keeps the app working.

| # | Stage | Contents | Done when |
|---|---|---|---|
| 1 | Registry and serializer | One registry, one export/import path for Firebase, Drive and files; remove `syncOptions`, `ExportOptions`, character picker. Cloud format unchanged. | `buildExport` / `exportCategories` are one path; options UI shows no per-category choices; existing sync unaffected |
| 2 | User-data store | `ArkadiaUserData`, HLC, `TypedStorage` façade, feature stores ported, `BroadcastChannel`, local migration, cache audit | All synced types read/write through the store; startup cost measured; e2e green |
| 3 | Sync engine v2 | Device logs, outbox, listener with cursors, base documents, compaction, encryption — behind a flag | Two-device e2e (section 13) converges with the flag on |
| 4 | Types on v2 | Knowledge first, then kills, visited rooms, profession, notes, multibinds, then settings types with `diff` | Each type round-trips through v2 with its rule tests |
| 5 | Cloud migration and cleanup | v1 import, full-state seed per device, one-way bridge, then removal of v1 code and conflict UI | Flag removed; v1 code deleted after the window |

## 12. Open decisions

1. **Resets.** Can the user reset knowledge progress, kill counts or visited rooms? If yes, those types need
   the reset epoch (section 5).
2. **Restore.** Besides merge-on-import, offer "restore from backup = replace everything"? It would be a
   newer-stamped rewrite of every record, so it propagates to other devices too.
3. **Bridge window** for old clients writing v1: suggested one release, about 2–4 weeks.
4. **Tick history window** before folding into daily counts: suggested 30 days.
5. **Unsynced player data (4.2):** which of oswajanie, enemy resistances, zlom, transport stats, delivery
   stats, sun tracker, and plugins should sync?
6. **Device-scoped types:** keep `uiSettings` whole-value per device, or split it per field now that the
   concern slices (`shellSettings`, …) are shared?

## 13. Testing

- **Rule tests** (Vitest): for every rule and type, randomized record sets checking that merge is
  commutative, associative and idempotent, and that folding into base then reading equals reading the raw
  logs.
- **Store tests:** `TypedStorage` façade parity with the current localStorage behavior; local migration from
  fixture profiles (including `character:key` data for several characters and every legacy database).
- **Two-device e2e** (Playwright, two browser contexts sharing a mocked Firestore via
  `e2e/support/firebase-fixtures.ts`): both tabs open and writing at the same time; one tab stale for a
  while and then editing; a phone-style tab killed with pending changes and reopened. Assert identical
  state on both sides and that the stale tab didn't overwrite newer data.
- **Compaction e2e:** push a log past the cap, compact concurrently from two contexts, assert no loss and no
  double-counted kills.
- **Migration e2e:** start from a v1 cloud document plus divergent local data on two devices; assert the
  union after both upgrade.

## 14. Risks

- **Startup latency** from awaiting the user-data store, especially on phones. Mitigation: measure in stage
  2; keep boot-critical values in localStorage.
- **Missed in-memory caches** showing stale data in open tabs. Mitigation: the cache audit in stage 2 and a
  store-level subscription used by every feature store.
- **Firestore cost:** more small writes than today. Mitigation: batched uploads (seconds, not per record)
  and one listener on the devices collection.
- **Clock skew** handled by HLC; a device with a wildly wrong clock can still win **newest** ties for a while.
  Mitigation: clamp stamps that are far in the future relative to the server timestamp of the upload.
