# Architecture Analysis — Arkadia Web Client

> Snapshot review of structure, god files, duplication, and refactor opportunities.
> Findings come from a broad fan-out read (excerpts of large files, not exhaustive
> line-by-line), so exact line numbers may drift slightly. Treat as a map, not a spec.

## The shape of the problem

The codebase is healthy in its *infrastructure* layer (event bus, storage, DataStore
framework, the popup window-manager) but suffers from three systemic issues that repeat
in every subsystem:

1. **Flat-directory sprawl** — 152 scripts, ~35 popups, 45+ option components all sit in
   single flat folders with no domain grouping.
2. **God files** — a handful of 1,000–3,500-line files each doing 4–6 distinct jobs.
3. **Missing base abstractions** — features that are structurally identical (counters,
   item evaluators, popups, settings tabs) were each hand-written, producing large-scale
   copy-paste.

The popup system already has a strong shared foundation (`DockablePopupWrapper` +
`usePopup`/`usePopupData`/`useAutoScroll` + `WindowManager`). Nobody reimplements window
chrome. That proves the right abstractions are achievable — they just haven't been applied
at the content level. **This is the template to follow elsewhere.**

---

## Tier 1 — God files (break these up first)

| File | Lines | Distinct jobs crammed in | Split into |
|---|---|---|---|
| `src/client/PluginApi.ts` | **3,556** | 25+ API domains + all type defs + cleanup tracking, in one class | `PluginApi/` dir: one file per API domain (Ui, Map, Events, Containers, People…), `types.ts`, a cleanup handler |
| `src/client/scripts/knowledge.ts` | 2,745 | data lookup + parsing + display + triggers + aliases + state machine | data layer / display / trigger-handlers |
| `src/web/ObjectList.ts` | 2,131 | 5 view-mode renderers + event handlers + Picture-in-Picture sync + filters | `ObjectListCardRenderer`, `ObjectListEventHandlers`, `PictureInPictureSync` |
| `src/web/uiSettings.ts` | 1,914 | types + defaults + validation + font mgmt + DOM-apply + storage | `…Types`, `…Defaults`, `…Validation`, `…Fonts`, `…Applier`, `…Storage` |
| `src/web/LogBrowser.tsx` | 1,677 | session manager + search + viewer + export + IndexedDB | `LogSessionManager`, `LogSearchPanel`, `LogViewer`, `logBrowserDb` |
| `src/modules/firebase/firebaseUnifiedSync.ts` | 1,473 | document I/O + category sync + device registry + sync groups + conflict resolution | 5 managers + `syncSchema.ts` |
| `src/web/options/Binds.tsx` | 1,161 | state + import orchestration + worker comms + conflict resolution + UI | `useBindsState`, `multibindImportService`, UI |
| `src/web/options/FirebaseTab.tsx` | 1,154 | auth + sync + metadata + persistence + UI | `useFirebaseAuth`, `useFirebaseSync`, split UI |
| `src/client/ansi/FormatState.ts` | 1,329 | color types + format state machine + `AnsiAwareBuffer` + ANSI parsing + hyperlinks | `colors`, `FormatState`, `AnsiAwareBuffer`, `AnsiParser` |
| `src/web/options/exportUtils.ts` | 1,270 | export builder + recordings + visited-rooms + knowledge + validation | one file per exportable domain + `importValidator` |
| `src/shared/map/MapHelper.ts` | 879 | position tracking + trip planner + directions + rendering + GMCP | extract managers — **and move out of `@shared`** (see Tier 4) |

**Highest leverage:** `PluginApi.ts`. Single worst offender, it's the *stable public
surface* plugins depend on, and splitting by domain is mechanical and low-risk (each
`create*Api()` factory is already self-contained).

---

## Tier 2 — Missing common ancestry (biggest duplication wins)

Places where N near-identical implementations should descend from one base. Ranked by payoff.

**1. Counter scripts → `BaseCounter`**
`kill.ts` (952), `improveCounter.ts` (821), `herbCounter.ts` (841), `deliveryStats.ts`,
`whoCount.ts`, `przybywajaCount.ts` all reinvent the same lifecycle: session + lifetime
split, `characterStorage` persistence, reset, formatted table output. A `BaseCounter`
abstract class collapses this and standardizes the self-persist guard logic each currently
hand-rolls differently.

**2. Table formatting → `TableFormatter`**
`createPad()` and `createHeader()` are defined **identically in at least 3 files**
(`kill.ts:106`, `improveCounter.ts:75`, `deliveryStats.ts:41`), and inlined again in
`herbCounter.ts`. ~80+ lines of byte-for-byte duplication. One utility class eliminates it.

**3. Popup content patterns → shared components**
Window chrome is already shared, but *content* isn't:
- **Message-list popups** (`ChatPopup`, `CombatPopup`, `PostepyPopup`) repeat the
  `DISPLAY_LIMIT` + `usePopupData` + `useAutoScroll` + filter→map shell → `<MessageListPopup>`.
- **Sectioned-list popups** (`ZabiciPopup`, `LootPopup`, `DepositsPopup`, `OswajaniePopup`)
  repeat sort→group→map-sections → `<SectionedListPopup>` + `useFilteredList()`.
- Estimated 300–400 LoC removable.

**4. Item evaluators → `ItemEvaluator`**
`weaponEvaluation`, `armorEvaluation`, `parryShieldEvaluation`, `priceEvaluation`,
`stoneValue` all follow parse → classify → format-colored → register-trigger. Same skeleton,
~200 lines each.

**5. Button-settings files**
`desktopButtonSettings.ts:55` `parseDesktopSteps` and `mobileButtonSettings.ts:195`
`parseSteps` are ~99% identical; `validMacroTypes` is defined twice; hold-config parsing
duplicated. Extract `buttonSettingsValidation.ts`.

**6. Settings tabs → `TabbedPanel` + `SettingsRepository` + form-field components**
`CharacterSettings.tsx`, `ButtonsSettings.tsx`, `ExportImport.tsx` each hand-roll
`type Tab = …` + manual state + button nav. And **381 raw `Form.Check/Control/Select`
usages** across `options/*.tsx` with zero shared field components. A small
`<FormColorField>`/`<FormToggleField>`/`<FormSelectField>` set plus a generic
`SettingsRepository<T>` (load/save/validate/watch) removes the most pervasive UI duplication.

**7. JSON DataStores → factory**
`herbsStore`, `magicsStore`, `magicKeysStore`, `knowledgeStore`, `wiedzaStore` are all
`FetchJsonLoader + IndexedDbSingleRecordStrategy + 24h TTL`. Collapse 7 files into
`createJsonDataStore(url, db, store, ttl)` + thin wrappers.

---

## Tier 3 — Organization (flat → domain folders)

Co-locating related files is what makes the Tier-2 duplication visible and fixable.

- `src/client/scripts/` (152 files) → `combat/`, `tracking/`, `transport/`, `mapping/`,
  `herbs/`, `knowledge/`, `evaluation/`, `crafting/`, `ui/`, `util/`
- `src/web/` popups (~35 files) → `src/web/popups/{chat,combat,stats,transport,game,map}/`
  with room for `popups/shared/`
- `main.ts`'s `registerScripts` (80+ unordered `init*()` calls) → grouped per-domain barrel imports

---

## Tier 4 — Unification / simplification of codepaths

- **GMCP fan-out** — many scripts independently `client.on("gmcp.char.state", …)` for the
  same event. A `gmcpAggregator` would centralize subscription and cut 40+ ad-hoc handlers.
- **Team/Object duplication** — `TeamManager` and `ObjectManager` both store
  `gmcp.objects.data` in parallel Maps. Make `ObjectManager` the single source of truth;
  `TeamManager` queries it.
- **Combat-execution spaghetti** — `KeyBindingManager` → `AttackController` →
  `AllyProtection` → back through `CommandProcessor`. A single `CombatExecutor` would
  linearize the ally-check-then-attack flow.
- **`@shared` scope leaks** — two real architectural smells:
  - `shared/events/clientEvents.ts` imports `@client`-specific types (`ChatEntry`,
    `FishingStatePayload`…), creating a **reverse dependency** `@shared → @client`. It
    should live in `@client/events`.
  - `MapHelper.ts` and the `shared/dom/` utilities depend on `characterStorage`/eventBus/DOM
    and aren't reusable by a non-web client — they belong in `@client`.
  - `src/shared/ansi/` is an **empty directory** — dead intent; the real ANSI code is in
    `client/ansi`. Fill it or remove it.
- **Storage-key naming** — flat, conventionless keys (`"kill_counter"`, `"improve_counter"`,
  `"herb_counts"`); a typo silently creates a new entry. A central `Stores` enum/const fixes this.

---

## Suggested sequence

1. **Split `PluginApi.ts`** by domain — biggest file, lowest risk, unblocks plugin-dev navigation.
2. **Extract `TableFormatter` + `BaseCounter`** — kills the most blatant copy-paste in `scripts/`.
3. **Folder reorganization** of `scripts/` and `web/popups/` — makes remaining duplication self-evident.
4. **Shared form-field components + `SettingsRepository`** — highest-frequency UI duplication.
5. **Fix the `@shared` reverse dependencies** — small, but genuine architecture violations.

---

## Caveats

- Line numbers are approximate (broad fan-out read, not exhaustive).
- The "duplicate pairs" `Postepy`/`Postepy2` and `Zabici`/`Zabici2` are **not** redundant —
  they're deliberate session-view vs. lifetime-analytics-dashboard splits. Only their
  sort/group helpers should be shared, not the components themselves.
