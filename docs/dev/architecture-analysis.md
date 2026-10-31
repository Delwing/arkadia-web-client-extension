# Architecture Analysis — Arkadia Web Client

> Snapshot review of structure, god files, duplication, and refactor opportunities.
> Findings come from a broad fan-out read (excerpts of large files, not exhaustive
> line-by-line), so exact line numbers may drift. Treat as a map, not a spec.
>
> **Originally written 2026-05-30, re-verified 2026-07-27 and again against master on
> 2026-10-31.** Re-measure before citing a number.

## Progress since the original review

| Original finding | Status on 2026-10-31 |
|---|---|
| `uiSettings.ts` — 1,914 lines, 6 jobs | **Done.** Split into `uiSettingsCore.ts` + `uiSettings/UiSettings.tsx` + `defaultUiSettings.ts`; the old path is a 6-line re-export shim. |
| `LogBrowser.tsx` — 1,816 lines | **Done.** 252 lines; the viewer lives in `src/ui/logViewer/` (largest file `LogViewer.tsx`, ~1,000) and `views/log-viewer/`. |
| `options/Binds.tsx` — 1,203 lines | **Obsolete.** Deleted with the new key-binds window (`src/web/automation/`). |
| 381 raw `Form.*` usages in `options/` | **Done.** Bootstrap is gone (2026-09-22). Shared controls (`Field`, `Check`, `Input`, `Select`, `ColorInput`, `ChoiceList`…) live in `src/ui/web/primitives/controls.tsx`. |
| `src/web/main.ts` | **Done.** 193 lines; the stock UI is one React tree under `src/web/app/`. |
| `src/shared/ansi/` empty directory | **Removed.** |
| Tier 2 #1/#2 — `BaseCounter` + table helpers | **Partly done** — used by `kill`, `improveCounter`, `deliveryStats`, `deposits`, `prettyContainers`; `herbCounter`, `whoCount`, `przybywajaCount` still hand-roll theirs. |
| `PluginApi.ts` — 5,510 lines | **Done** (2026-10-31). `src/client/PluginApi/`: 30 files, one per domain (types + a `create*Api(ctx)` factory that owns its registrations and cleanup), largest `map.ts` (~620). `PluginApiImpl` is a ~150-line assembler. The plugin types are now generated entirely from source (#1433). |
| `scripts/knowledge.ts` — 2,835 lines | **Done** (2026-10-31). `src/client/scripts/knowledge/`: one file per feature (`libraries`, `books`, `entries`, `detailsRun` for `/wiedza_buduj`, `levels`, `hints`) sharing a `KnowledgeContext`, over pure `parsing` / `progress` / `reports`; largest `libraries.ts` (~440). The two near-identical details-report builders became one. |

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

Line counts as of 2026-10-31; the "was" column is the 2026-07-27 reading.

| File | Lines (was) | Distinct jobs crammed in | Split into |
|---|---|---|---|
| `src/shared/map/MapHelper.ts` | 1,874 (911) | position tracking + trip planner + directions + rendering + GMCP | extract managers — **and move out of `@shared`** (see Tier 4) |
| `src/client/ansi/FormatState.ts` | 1,483 (1,329) | color types + format state machine + `AnsiAwareBuffer` + ANSI parsing + hyperlinks | `colors`, `FormatState`, `AnsiAwareBuffer`, `AnsiParser` |
| `src/modules/firebase/firebaseUnifiedSync.ts` | 1,376 (1,328) | document I/O + category sync + device registry + sync groups + conflict resolution | Mostly the v1 single-document sync — most of it goes when v1 is removed (`docs/dev/SYNC_V2_PLAN.md`, stage 5b); the device registry stays |
| `src/web/options/exportUtils.ts` | 1,246 (1,275) | export builder + recordings + visited-rooms + knowledge + validation | one file per exportable domain + `importValidator` |
| `src/web/ObjectList.ts` | 1,197 (1,080) | view-mode renderers + event handlers + Picture-in-Picture sync + filters | `ObjectListCardRenderer`, `ObjectListEventHandlers`, `PictureInPictureSync` |
| `src/web/options/FirebaseTab.tsx` | 1,091 (1,042) | auth + sync + metadata + persistence + UI | `useFirebaseAuth`, `useFirebaseSync`, split UI |

**Highest leverage:** `MapHelper.ts` — the largest file left, and the move out of `@shared` comes with it.

---

## Tier 2 — Missing common ancestry (biggest duplication wins)

Places where N near-identical implementations should descend from one base. Ranked by payoff.

**1. Counter scripts → `BaseCounter`** — *partly done*
`src/client/scripts/BaseCounter.ts` and `counterTableUtils.ts` (with ANSI-segment-aware
truncation) cover `kill`, `improveCounter`, `deliveryStats`, `deposits` and
`prettyContainers`. **`herbCounter` (939 lines, still builds its own header),
`whoCount` and `przybywajaCount` have not been migrated.**

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

- **GMCP fan-out** — ~70 ad-hoc `.on('gmcp.*')` handlers, 9 of them on
  `gmcp.char.state`. A `gmcpAggregator` would centralize subscription.
- **Team/Object duplication** — `TeamManager` and `ObjectManager` both store
  `gmcp.objects.data` in parallel Maps. Make `ObjectManager` the single source of truth;
  `TeamManager` queries it.
- **Combat-execution spaghetti** — `KeyBindingManager` → `AttackController` →
  `AllyProtection` → back through `CommandProcessor`. A single `CombatExecutor` would
  linearize the ally-check-then-attack flow.
- **`@shared` scope leaks** — real architectural smells:
  - `shared/events/clientEvents.ts` imports ~20 `@client`-specific types (`ChatEntry`,
    `FishingStatePayload`…), creating a **reverse dependency** `@shared → @client`
    (8 files in `src/shared` import `@client`). The client events should live in
    `@client/events`.
  - `MapHelper.ts` depends on `characterStorage` and `@client` types, and
    `shared/dom` (`outputText`, `outputMessageHandler`) imports `@client/ansi`. They
    aren't reusable by a non-web client — they belong in `@client` (or the DOM parts
    in `@web`).
- **Storage-key naming** — `characterStorageKeys` in `storageSchema.ts` lists the keys,
  but code still uses literal strings (`"herb_counts"` in `herbCounter`, `inventory`,
  `contextMenus`); a typo silently creates a new entry. A central `Stores` const used
  at the call sites fixes this.

---

## Suggested sequence

1. ~~Split `PluginApi.ts` by domain~~ and ~~`knowledge.ts`~~ — both done 2026-10-31.
2. **Finish `BaseCounter`** — migrate `herbCounter`, `whoCount` and `przybywajaCount`.
3. **Remove sync v1** — takes most of `firebaseUnifiedSync.ts` with it.
4. **Folder reorganization** of `scripts/` and web popups — makes remaining duplication self-evident.
5. **Fix the `@shared` reverse dependencies** — small, but genuine architecture violations.

---

## Caveats

- In-file line *references* are approximate (broad fan-out read, not exhaustive).
- This is a dated snapshot, not a live document. Re-measure before citing a number.
- The "duplicate pairs" `Postepy`/`Postepy2` and `Zabici`/`Zabici2` are **not** redundant —
  they're deliberate session-view vs. lifetime-analytics-dashboard splits. Only their
  sort/group helpers should be shared, not the components themselves.
