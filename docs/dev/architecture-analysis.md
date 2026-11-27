# Architecture Analysis — Arkadia Web Client

> Snapshot review of structure, god files, duplication, and refactor opportunities.
> Findings come from a broad fan-out read (excerpts of large files, not exhaustive
> line-by-line), so exact line numbers may drift. Treat as a map, not a spec.
>
> **Originally written 2026-05-30, re-verified 2026-07-27 and again against master on
> 2026-10-31; the Tier 1 splits landed 2026-11-05; re-measured and the layering pass
> landed 2026-11-08; `Keys.tsx` split 2026-11-10; plugin editor and `objectList/strategies.ts`
recorded, sizes re-measured 2026-11-12; object-list views moved to React 2026-11-13.** Re-measure before citing a number.

## Progress since the original review

| Original finding | Status |
|---|---|
| `uiSettings.ts` — 1,914 lines, 6 jobs | **Done.** Split into `uiSettingsCore.ts` + `uiSettings/UiSettings.tsx` + `defaultUiSettings.ts`; the old path is a 6-line re-export shim. |
| `LogBrowser.tsx` — 1,816 lines | **Done.** 252 lines; the viewer lives in `src/ui/logViewer/` (largest file `LogViewer.tsx`, ~1,000) and `views/log-viewer/`. |
| `options/Binds.tsx` — 1,203 lines | **Obsolete.** Deleted with the new key-binds window (`src/web/automation/`). |
| 381 raw `Form.*` usages in `options/` | **Done.** Bootstrap is gone (2026-09-22). Shared controls (`Field`, `Check`, `Input`, `Select`, `ColorInput`, `ChoiceList`…) live in `src/ui/web/primitives/controls.tsx`. |
| `src/web/main.ts` | **Done.** 193 lines; the stock UI is one React tree under `src/web/app/`. |
| `src/shared/ansi/` empty directory | **Removed.** |
| Tier 2 #1/#2 — `BaseCounter` + table helpers | **Partly done** — only `kill` and `improveCounter` extend `BaseCounter`; `deliveryStats`, `deposits` and `prettyContainers` use just the `counterTableUtils` table helpers; `herbCounter`, `whoCount`, `przybywajaCount` still hand-roll theirs. |
| `PluginApi.ts` — 5,510 lines | **Done** (2026-10-31). `src/client/PluginApi/`: 30 files, one per domain (types + a `create*Api(ctx)` factory that owns its registrations and cleanup), largest `map.ts` (~620). `PluginApiImpl` is a ~150-line assembler. The plugin types are now generated entirely from source (#1433). |
| `scripts/knowledge.ts` — 2,835 lines | **Done** (2026-10-31). `src/client/scripts/knowledge/`: one file per feature (`libraries`, `books`, `entries`, `detailsRun` for `/wiedza_buduj`, `levels`, `hints`) sharing a `KnowledgeContext`, over pure `parsing` / `progress` / `reports`; largest `libraries.ts` (~440). The two near-identical details-report builders became one. |
| `src/shared/map/MapHelper.ts` — 1,893 lines | **Done** (2026-11-04). Moved to `src/client/map/` and split by responsibility: `MapDataStore` (reader, pathfinder, lookups) + `liveEdits` (`syncAreas`/`applyRoomChanges`), `PositionTracker` (current room, moves, GMCP fixes) with `PositionLoss` and `MoveJournal`, `exitResolution` (pure direction/exit logic), `LeadPlanner` (/prowadz, /prowadzt, trip planner), `MapDrawData` (path/highlight/label events), `RoomBinds`, `mapEvents` (client-event wiring). `MapHelper` stays as the facade `client.Map` (~450 lines, all delegation); largest part `PositionTracker` (~390). The route planners (`transportPathFinder`, `carriagePathFinder`, `roomDistances`) moved with it; the UI-neutral `directions`, `exitCommands` and `dataLoader` stay in `@shared/map`. No DOM was involved: "rendering" was only the draw-data events. Plugin types unchanged. The labyrinth and tide scripts now reach the map's hashes and pathfinder through `client.Map.data` instead of `as any` pokes. |
| `ansi/FormatState.ts` — 2,083 lines | **Done** (2026-11-04). `src/client/ansi/`: `colors` (colour types, `#rrggbb`, the Mudlet palette), `formatSnapshot` (a segment's formatting: clone / compare / overlay; links are just a field of it, not a job of their own), `AnsiParser` (the SGR state machine, escapes → segments), `renderSegments` (segments → HTML / DOM), `TextSelection`, and `AnsiAwareBuffer` (~1,250 — still the largest, but it is one plugin-facing class: its methods are the API). `FormatState.ts` is an 18-line re-export shim for the ~200 importers; the plugin types generate unchanged. |
| `options/exportUtils.ts` — 1,246 lines | **Done** (2026-11-04). `src/web/options/export/`: one handler per hand-written category in `categories/` (`uiSettings`, `characterSettings`, `buttons` + `radial`, `killCounts`, `knowledge`, `visitedRooms`, `recordings`, `locationNotes`, `multibinds`), dispatched from a table in `categories.ts` instead of two parallel switches; `backup` (v2 file), `legacyBackup` (v1 restore), `importValidator`, `characterKeys`, `storageKeys` (generic registry keys), `storageChanges` (tracked writes + listener notification), `mergeEnvelopes`. Largest `legacyBackup.ts` (~140). Factored out: the listener notification and the profession CRDT merge (each written out 2–3 times), the two IndexedDB openers, the `mobileButtonSettings` read-merge. The old `exportUtils.ts` path is gone; importers use `export/` (the barrel `export/index.ts` for the lazily loaded sync code). Tests mirror it under `test/web/options/export/`. |
| `ObjectList.ts` — 1,199 lines | **Done** (2026-11-04). `src/web/objectList/`: `ObjectList.ts` is the shell (~260: subscriptions, view mode, render), `ObjectListEventHandlers.ts` the clicks and context menus (~430), `objectListDrag.ts` the floating window's drag (~140), and `pip/` the Picture-in-Picture window (`PictureInPictureSync` ~240, plus `pipStatus`, `pipHtml`, `pipStyles`). The view-mode renderers and the filters had already moved out (`strategies.ts`, `objectListFilters.ts`). |
| `options/FirebaseTab.tsx` — 1,091 lines | **Done** (2026-11-04). `src/web/options/firebase/`: hooks `useFirebaseInit`, `useFirebaseAuth` (auth state + sign-in form), `useFirebaseSync` (settings, passphrase, toasts, manual actions) and one component per section (`AuthForm`, `AccountBar`, `EncryptionSection`, `AutoSyncSection`, `LocationHandoffSection`, `CloudDeleteSection`, `SyncButtons`…); `FirebaseTab.tsx` is a ~110-line composer, largest file `useFirebaseSync.ts` (~210). The sync-v1 code (engine events, cloud metadata, conflict dialog, v1 actions, the disable-encryption flow) is in `firebase/v1/`, to delete in stage 5b of `SYNC_V2_PLAN.md`, but not all of it is v1-only: `cloudMetadata` from `v1/useSyncV1` also feeds `EncryptionSection` and `FirebaseTab` in v2 mode, so stage 5b needs edits outside `v1/` too. |
| Client "DOM-free" claim vs. reality | **Done** (2026-11-08). `src/client` used `window`/`document`/`navigator` in ~30 places: 8 global `keydown` listeners, 7 `beforeunload`, clipboard, file save/open (`oswajanie`), legacy plugin `<script>` tags, the `add-script` URL parameter, cross-tab `storage` events, notifications, the audio-unlock gesture, three copies of Mac detection. All go through `HostPort` (`@client/ports/hostPort.ts`; browser implementation `src/web/browserHost.ts`, also installed by the unit-test setup). ESLint `no-restricted-globals` forbids the four globals in `src/client`; the one exception is `renderSegments.ts` (the renderer behind `AnsiAwareBuffer.toDom()`). |
| `@modules → @web` (not in the original review) | **Done** (2026-11-08). `contextMenus.ts` (room/herb menus) was web UI in `@modules/core`: now `src/web/gameContextMenus.ts`, and the six client scripts that opened those menus call `UiPort.showHerbMenu` / `showRoomMenu`. `triggerSettingsReload` / `applyImportedDeviceSettings` → `src/web/deviceSettingsReload.ts`; the unused `deviceSettingsBundle.ts` deleted; two settings migrations take their web pieces as loaders from the bootstrap. Only sync v1 still `import()`s `@web/options/export` (a listed lint exception until stage 5b). |
| `@shared → @client` reverse dependency (Tier 4), and `@modules → @client` (~20 runtime imports, not in the original review) | **Done** (2026-11-08). Moved down: `dataCache`, `wiedzaLoader` → `@modules/data`; default attack/draw/support commands → `@modules/core`; `stripPolishCharacters`, `knowledgeCategories`, `types/letter` → `@shared`. Moved up: `Colors.ts` → `@client` (≈100 client importers); `proposalValidator` → `@web/assistant` (web-only); `outputMessageHandler`, `outputText` → `@web/output`. `clientEvents.ts` now type-imports its client payload types. ESLint forbids runtime upward imports for all three lower layers (static and `import()`; type-only imports allowed). |
| `src/web/keys/Keys.tsx` — 1,665 lines | **Done** (2026-11-10). Six jobs in one component: storage (keymaps, debounced saves, helper re-registration), the edit rules (assign a key, "gdzie działa", twins, own shortcuts), key capture (page or helper listening), the helper's status, measuring, and the render for four width steps. Now: `keyEdits.ts`, pure functions that return what an edit changes (unit-tested in `test/web/keys/keyEdits.test.ts`); hooks `useKeymapStore`, `useHelperStatus`, `useKeyCapture`, `useKeysSize`; components `KeyboardView`, `KeyDetail`, `KeysToolbar`, `CaptureOverlays` and one per list in `sections/`, sharing state through `KeysContext`. `Keys.tsx` is a ~440-line composer that owns the view state and the four layouts. Fixed on the way: an own shortcut moved to a key the browser keeps left its helper twin behind on the old key, and a built-in bind refused such a key still moved its twin. |
| `plugins/editor/main.ts` (2,135) and `monacoSetup.ts` (1,940) | **Done** (`b5e9848`). `main.ts` is a bootstrap (~290 lines now) over `session` (the open plugin, its models, load/switch/save/close, reaching the rest through `sessionHooks`), `fileTreeActions`, `pluginActions`, `jsPreview`, `filePicker`, `devServerUi`, `folderLink` and `panelResizers` (three copy-pasted resizers → one helper). `monacoSetup.ts` is gone: `plugins/editor/monaco/` holds `editorSetup`, `themes`, `typings`, `importAnalysis` (unit-tested), `autoImportCompletion`, `importPathCompletion`, `moduleNames`. Fixed on the way: wrong auto-import paths across folders, a dropped default import, the ~7,000-line API typings re-parsed on every completion, stale JSON typings after a rename. Largest file now `session.ts` (~670, grown since with tabs and split view); `codingAgentPanel.ts` (1,081) was not part of it. |
| `src/web/objectList/strategies.ts` — 1,004 lines | **Done** (2026-11-12, React 2026-11-13). First split one file per view mode, then rewritten as React components in `src/web/objectList/views/`: `ListView`, `CardView`, `CompactView` (with a `dots` variant for compact-dots), `RaidView`, `NearbyView`, over `entry.ts` (one object's side, combat state and filter result, worked out once instead of six times), `cardParts.tsx` / `cardModel.ts` (badge, name, icons, attackers, HP shared by the card family) and `markup.tsx` (plugin HTML, name text, cover shield). `ObjectList` mounts a React root on each list and the pop-out window has its own (`pip/PipView.tsx`). Game text is now escaped (descriptions went into `innerHTML` raw before); plugin filter HTML (`hpBar`, `numberLabel`, `description`, `prefix` / `suffix`) still goes in as HTML. Elements survive re-renders, so the per-render card context-menu listeners are gone. Largest file `ListView.tsx` (~170). |

## The shape of the problem

The codebase is healthy in its *infrastructure* layer (event bus, storage, DataStore
framework, the popup window-manager, the UI primitives) but suffers from three
systemic issues that repeat in every subsystem:

1. **Flat-directory sprawl** — ~200 scripts, 41 popups, ~60 option components, mostly
   in single flat folders with no domain grouping.
2. **God files** — a handful of 1,000–5,500-line files each doing 4–6 distinct jobs.
3. **Missing base abstractions** — features that are structurally identical (counters,
   item evaluators, popups, settings tabs) were each hand-written, producing large-scale
   copy-paste.

The popup system has a strong shared foundation (`DockablePopupWrapper` +
`usePopup`/`usePopupData`/`useAutoScroll` + `WindowManager`), and the form controls
now do too. Nobody reimplements window chrome or form fields. **This is the template
to follow elsewhere.**

---

## Tier 1 — God files (break these up first)

Line counts as of 2026-11-12. The six files of the 2026-10-31 list are done except
`firebaseUnifiedSync.ts`, and so are `Keys.tsx`, the plugin editor and `objectList/strategies.ts`
(see the progress table); what is left is the next-largest files. Only `firebaseUnifiedSync.ts`
has had a jobs-per-file read yet.

| File | Lines | Distinct jobs crammed in | Split into |
|---|---|---|---|
| `src/web/assistant/proposalValidator.ts` | 1,385 | to be analysed (moved from `@modules/core/assistant` 2026-11-08) | to be analysed |
| `src/modules/firebase/firebaseUnifiedSync.ts` | 1,376 | document I/O + category sync + device registry + sync groups + conflict resolution | Mostly the v1 single-document sync — most of it goes when v1 is removed (`docs/dev/SYNC_V2_PLAN.md`, stage 5b); the device registry stays |
| `src/client/scripts/inventory.ts` | 1,276 | to be analysed | to be analysed |
| `src/web/herbs/HerbManager.tsx` | 1,209 | to be analysed | to be analysed |
| `src/client/scripts/raonLabyrinthMapper.ts` | 1,186 | to be analysed | to be analysed |

`AnsiAwareBuffer.ts` (1,255) is deliberately not listed: it is one plugin-facing class
whose methods are the API.

Next in size, not yet read: `MudClient.ts` (1,164), `transportTracker.ts` (1,118),
`plugins/editor/codingAgentPanel.ts` (1,081), `StaticMapPopup.tsx` (1,071),
`LogViewer.tsx` (1,051), `oswajanie.ts` (1,031), `WindowManager.ts` (1,030), `clock.ts` (1,027).

**Highest leverage:** `proposalValidator.ts` and `inventory.ts` — the two largest files left that
nobody has read for jobs yet. `firebaseUnifiedSync.ts` is larger but mostly goes with sync v1.

---

## Tier 2 — Missing common ancestry (biggest duplication wins)

Places where N near-identical implementations should descend from one base. Ranked by payoff.

**1. Counter scripts → `BaseCounter`** — *partly done*
`src/client/scripts/BaseCounter.ts` is extended by `kill` and `improveCounter`;
`counterTableUtils.ts` (with ANSI-segment-aware truncation) is also used by
`deliveryStats`, `deposits` and `prettyContainers`. **`herbCounter` (978 lines, still
builds its own header), `whoCount` and `przybywajaCount` have not been migrated.**

**2. Popup content patterns → shared components**
Window chrome is shared, but *content* isn't:
- **Message-list popups** (`ChatPopup`, `CombatPopup`, `PostepyPopup`) repeat the
  `DISPLAY_LIMIT` + `usePopupData` + `useAutoScroll` + filter→map shell → `<MessageListPopup>`.
- **Sectioned-list popups** (`ZabiciPopup`, `LootPopup`, `DepositsPopup`, `OswajaniePopup`)
  repeat sort→group→map-sections → `<SectionedListPopup>` + `useFilteredList()`.
- Estimated 300–400 LoC removable.

**3. Item evaluators → `ItemEvaluator`**
`weaponEvaluation`, `armorEvaluation`, `parryShieldEvaluation`, `priceEvaluation`, the
self evaluator and `stoneValue` all follow parse → classify → format-colored →
register-trigger. Same skeleton, ~200 lines each.

**3a. ~~Object-list card renderers~~** — **done** (2026-11-13) with the move to React:
one `entryOf(obj, ctx)` and shared card parts; `compact` and `compact-dots` are one component.

**4. Button-settings files**
`desktopButtonSettings.ts` `parseDesktopSteps` and `mobileButtonSettings.ts`
`parseSteps` started as near-copies and have since drifted apart; hold-config parsing
is still duplicated. Extract the shared step/hold validation into
`buttonSettingsValidation.ts` before they drift further.

**5. Settings tabs → `TabbedPanel` + `SettingsRepository`**
`ExportImport.tsx`, `Scripts.tsx` and `KnowledgeWindow.tsx` each hand-roll
`type Tab = …` + manual state + button nav. The form-field half of the original
finding is solved by the primitives; a `TabbedPanel` and a generic
`SettingsRepository<T>` (load/save/validate/watch) are still missing.

**6. JSON DataStores → factory**
`herbsStore`, `magicsStore`, `magicKeysStore`, `wiedzaStore` (in
`src/modules/data/dataStores/`), plus `npcStore` and `mapStore`, all wire
`FetchJsonLoader` + an IndexedDB strategy + TTL by hand. Collapse into
`createJsonDataStore(url, db, store, ttl)` + thin wrappers.

---

## Tier 3 — Organization (flat → domain folders)

Co-locating related files is what makes the Tier-2 duplication visible and fixable.

- `src/client/scripts/` (~200 entries; only `other/`, `ships/`, `skarbce/`,
  `transports/` are grouped) → `combat/`, `tracking/`, `transport/`, `mapping/`,
  `herbs/`, `knowledge/`, `evaluation/`, `crafting/`, `ui/`, `util/`
- `src/web/` popups (41 `*Popup*.tsx`; `src/web/popups/` holds only the catalog and
  CSS) → `src/web/popups/{chat,combat,stats,transport,game,map}/` with room for
  `popups/shared/`
- `registerScripts` in `src/client/main.ts` (~170 `init*()` calls, a handful of
  comment headers) → grouped per-domain barrel imports

---

## Tier 4 — Unification / simplification of codepaths

- **GMCP fan-out** — 73 ad-hoc `.on('gmcp.*')` handlers, 10 of them on
  `gmcp.char.state`. A `gmcpAggregator` would centralize subscription.
- **Team/Object duplication** — `TeamManager` and `ObjectManager` both store
  `gmcp.objects.data` in parallel Maps. Make `ObjectManager` the single source of truth;
  `TeamManager` queries it.
- **Combat-execution spaghetti** — `KeyBindingManager` → `AttackController` →
  `AllyProtection` → back through `CommandProcessor`. A single `CombatExecutor` would
  linearize the ally-check-then-attack flow.
- ~~**`@shared` scope leaks**~~ — **done** (2026-11-08), together with the `@modules`
  leaks; see the progress table. The layering is now `@shared` ← `@modules` ← `@client`
  ← `@web`/`@web-ui`, enforced by ESLint for runtime imports. What is left:
  - **Type-only upward imports** are still allowed and still common: `clientEvents.ts`
    names ~35 payload types from client modules (`ChatEntry`, `FishingStatePayload`…),
    10 files in `@modules` name client types, `pluginUiRegistry` / `pluginButtonMacroRegistry`
    name `@web` types. They erase at build time, but they make the layers read as one.
    Moving payload types next to the events (or into `@shared/types`) would let the
    rules drop `allowTypeImports`.
  - **Sync v1** keeps three `import('@web/options/export')` calls under a listed lint
    exception; they go with v1 (stage 5b).
  - **`@web-ui` → `@web`**: 16 files in `src/ui/web` import `@web`. Whether `@web-ui`
    is a layer below `@web` or the same layer is undecided; no rule yet.
- **Storage-key naming** — `characterStorageKeys` in `storageSchema.ts` lists the keys,
  but ~100 `characterStorage.get/set` calls still pass literal strings (`"herb_counts"`
  in `herbCounter`, `inventory`, `gameContextMenus`); a typo silently creates a new entry. A central `Stores` const used
  at the call sites fixes this.

---

## Suggested sequence

1. ~~Split `PluginApi.ts` by domain~~ and ~~`knowledge.ts`~~ — both done 2026-10-31; ~~the Tier 1 splits (`MapHelper`, `FormatState`, `exportUtils`, `ObjectList`, `FirebaseTab`)~~ — done 2026-11-05.
2. ~~**Close the layering leaks**~~ — done 2026-11-08 (`HostPort`, `@modules`/`@shared` upward imports, ESLint rules).
3. **Remove sync v1** — takes most of `firebaseUnifiedSync.ts` with it, and the last lint exception. Check Firestore first.
   Not before ~2026-12-01: v2 became the default ~2026-11-01 and the plan keeps v1 for a one-month transition.
4. **Analyse and split the remaining Tier 1 files** — ~~`Keys.tsx`~~ done 2026-11-10; ~~plugin editor~~
   and ~~`objectList/strategies.ts`~~ done; next read `proposalValidator.ts` and `inventory.ts`.
5. **Move string-built UI to React** (AGENTS.md: UI is React). Done for the object lists; candidates are
   the other `innerHTML` renderers in `src/web` (e.g. the object-list demo in `objectListDoc.ts`, which
   hand-copies the views' markup and could render the real views).
6. **Finish `BaseCounter`** — migrate `herbCounter`, `whoCount` and `przybywajaCount`.
7. **Folder reorganization** of `scripts/` and web popups — makes remaining duplication self-evident. One domain at a time: it churns imports.

---

## Caveats

- In-file line *references* are approximate (broad fan-out read, not exhaustive).
- This is a dated snapshot, not a live document. Re-measure before citing a number.
- The "duplicate pairs" `Postepy`/`Postepy2` and `Zabici`/`Zabici2` are **not** redundant —
  they're deliberate session-view vs. lifetime-analytics-dashboard splits. Only their
  sort/group helpers should be shared, not the components themselves.
