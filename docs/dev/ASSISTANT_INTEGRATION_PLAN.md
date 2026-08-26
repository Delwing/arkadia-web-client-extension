# In-client AI assistant — integration plan

Dev-facing. `docs/` root is user-facing; this file is deliberately in `docs/dev/`.

Scope: how the assistant plugs into the **existing** client. The knowledge bundle
(`public/assistant-kb.json`, `scripts/build-assistant-kb.ts`), the shared bundle types in
`src/shared/`, and the Cloudflare Worker in `worker/` are built separately and are treated
here as given inputs.

Invariants that shape everything below:

- `src/client/**` must not import `@web`/`@web-ui` at runtime. Enforced by
  `eslint.config.js:82-98` (`@typescript-eslint/no-restricted-imports`, `allowTypeImports: true`).
- `data/` is never modified.
- Regex literals in `src/client` must be ASCII-only (no Polish diacritics).
- UI strings are Polish.

---

## 0. Component map (what gets created)

| New file | Layer | Purpose |
|---|---|---|
| `src/modules/core/assistant/proposalTypes.ts` | core | Discriminated union of proposals + `AssistantAnswer` |
| `src/modules/core/assistant/validateProposal.ts` | core | Pure validation → `Ok`/`Reject`; no storage, no DOM |
| `src/modules/core/assistant/aliasRegistry.ts` | core | (optional) exported alias/trigger normalizers, see §3 |
| `src/web/assistant/applyProposal.ts` | web | The **only** place that persists a proposal |
| `src/web/assistant/assistantClient.ts` | web | Worker `POST /ask` + degradation ladder |
| `src/web/assistant/assistantKeyStore.ts` | web | BYOK key, per-device, never synced (§5) |
| `src/web/assistant/buildAssistantPrompt.ts` | web | Clipboard-bridge prompt builder (tier 3) |
| `src/web/AssistantPopup.tsx` | web | The dockable/detachable chat panel |
| `src/web/assistant/ProposalCard.tsx` | web | Confirm/reject card ("Zastosuj" / "Odrzuć") |
| `src/web/assistant/ClipboardBridgeDialog.tsx` | web | Generalised `SubDialog` (§2) |
| `src/client/scripts/assistant.ts` | client | `/pomoc` alias → event bus |

Already present (built by the KB agent, **reuse, do not duplicate**):
`src/modules/core/assistant/settingsRegistry.ts` — exports `SettingDescriptor`, `SettingScope`,
`SettingValueType`, `SETTING_DESCRIPTORS`, `lookupSetting(key): SettingLookup`,
`suggestSettingKeys(key, limit)`, `assistantEditableKeys()`, `editDistance`.
`lookupSetting` returns `{status:'found',descriptor} | {status:'ambiguous',candidates} | {status:'unknown',suggestions}`.

---

## 1. Where the panel lives

### 1.1 Decision

Build it as a **standard dockable popup** with id `popup:assistant`. It then gets docking,
floating, pinning, locking and **detaching into a separate OS window for free** — there is no
separate "detachable panels" registry; every popup that owns a portal target is detachable.

Do **not** build it as a settings modal (`#assistant-modal` + a forge `ModalKey`): that would
require parallel wiring in two hosts and cannot be popped out.

### 1.2 How popout actually works (so you don't break it)

- `popup/index.html` + `popup/main.ts` — a *stylesheet-only* Vite entry
  (`vite.config.ts:85`, `popup: resolve('popup/index.html')`). Body is just
  `<div id="popout-root" class="popout-root">`.
- `src/web/layout/components/PopoutWindowLayer.tsx` — `window.open('popup/index.html', ...)`,
  then physically `appendChild`s the panel's **existing** portal target div into the external
  document. The React subtree is never re-created. `rescuePortalTarget()` moves it back on close.
- `src/web/layout/WindowManager.ts` — `windowManager.setPoppedOut(id, boolean)`,
  `getOrCreatePortalTarget(id)`. `poppedOut` is a live-only flag on `WindowRecord`
  (`src/web/layout/types.ts:145`), healed to `false` in `loadState`, never persisted.
- `src/web/layout/components/PanelHeader.tsx` — `usePanelChrome(window)` adds the popout
  button for `isPopup || isBuiltIn`.
- `src/web/layout/LayoutContent.tsx` splits `visibleWindows` / `poppedWindows`.

**Gotcha to respect:** `useDockablePopup` deliberately excludes `title` from its register-effect
deps (`src/web/layout/hooks/useDockablePopup.ts:92-98`) — re-registering drops `poppedOut` and
snaps the window back. If the assistant panel wants a dynamic title (e.g. "Asystent (3)"),
use `updatePopup(id, { title })` from `src/web/layout/popupRegistry.ts`, never a re-register.

**If a new global stylesheet is added** for the assistant, add it to `popup/main.ts` too
(its header comment says so) or the popped-out panel renders unstyled.

### 1.3 Exact contract for a new panel

1. `const POPUP_ID = 'popup:assistant'` inside the component.
2. Add `| 'assistant'` to `BuiltInPopupType` in `src/web/layout/types.ts:50-88`.
3. Add the open event to `src/shared/events/clientEvents.ts`:
   ```ts
   "assistant.popup.open": { question?: string; seedTriggerText?: string } | void;
   ```
   (Imitate `"staticmap.popup.open": { roomId?: number; areaId?: number; instanceId?: string }`
   at `clientEvents.ts:359`.)
4. Component skeleton — **imitate `src/web/ChatPopup.tsx` almost line for line**; it is the
   canonical scrolling message panel:
   ```tsx
   const { wrapperProps, isOpen } = usePopup(POPUP_ID, {
       openEvent: 'assistant.popup.open',
       onOpen: (data) => { /* seed input from data?.question / seedTriggerText */ },
   });
   const { containerRef, handleScroll } = useAutoScroll({ deps: [messages] });
   const [model, setModel] = usePopupSetting(POPUP_ID, 'model', 'auto');
   return (
     <DockablePopupWrapper {...wrapperProps} popupType="assistant" title="Asystent"
        minWidth={380} minHeight={320} headerActions={<AssistantHeaderMenu … />}>
        …
     </DockablePopupWrapper>
   );
   ```
   Hooks: `src/web/hooks/usePopup.ts`, `src/web/hooks/usePopupSetting.ts`,
   `src/web/hooks/useAutoScroll.ts`. Wrapper: `src/web/layout/components/DockablePopupWrapper.tsx`.
5. Register in `src/web/popups/popupCatalog.tsx` → `POPUP_CATALOG.push({ id: 'popup:assistant', Component: AssistantPopup })`.
   That single edit mounts it in **both** UIs (`src/web/layout/LayoutManagerWrapper.tsx:60` maps
   the catalog; forge pairs each with `FloatingPopupHost`). Popups are headless until their open
   event fires, so mounting is inert.

`registerPopup(...)` (`src/web/layout/popupRegistry.ts`) is called for you by `useDockablePopup`
inside `DockablePopupWrapper` — never call it directly.

### 1.4 Footer chip (optional, phase 2)

The registry is `src/modules/core/footerRegistry.ts`:
`registerFooterItem(item: FooterItem)`, `unregisterFooterItem(id)`, `getFooterItems()`,
`subscribeFooterItems(listener)`. `FooterItem = { id; order; source?: 'builtin'|'plugin'; render?: () => ReactNode; node?: HTMLElement }`.

To add an "Asystent" chip:
1. Write `AssistantChip()` in `src/ui/web/footer/chips.tsx` (imitate `ClockChip`), using
   `Chip` from `src/ui/web/footer/Chip.tsx` and `ChipIcon` from `src/ui/web/footer/icons.tsx`
   (add a glyph to `PATHS` if needed).
2. Register in `src/ui/web/footer/builtinItems.tsx` → `BUILTIN_FOOTER_ITEMS`.
3. Add the id to `defaultFooterComponents` in `src/web/defaultUiSettings.ts:24` —
   `validateFooterComponents` (`src/web/uiSettingsCore.ts:86`) **drops any id not in that list**.
4. Add a Polish display name to `DISPLAY_NAMES` in `src/web/options/FooterComponentSettings.tsx:22`.
5. **Stock UI does not render `FooterStrip`.** Only forge calls `registerBuiltinFooterItems()`
   (`forge-ui/client/bootstrap.ts:72`). For the stock footer you must additionally add a
   `<span id="assistant-chip">` inside `#char-state` in `index.html` and an entry in
   `src/ui/web/mountComponents.tsx`'s `componentConfigs`.

Given that 5-step cost, **defer the chip**. Ship `/pomoc` + the output context menu first.

---

## 2. The clipboard bridge (ladder tier 3) — generalising the existing prototype

### 2.1 What exists today

`src/web/options/Scripts.tsx`:

- state: `showAiModal`, `aiDescription`, `aiCopied` (lines 36-41)
- `handleAiCopy()` (lines 175-189):
  ```ts
  await navigator.clipboard.writeText(buildAiPluginPrompt(description));
  setAiCopied(true); setTimeout(() => setAiCopied(false), 3000);
  ```
- the dialog itself, lines **495-542**: a `SubDialog size="lg" title="Wygeneruj plugin z AI"`
  containing an explanation `<p>`, a textarea, and a button row —
  `Kopiuj prompt` / `Otwórz Claude` (`https://claude.ai/new`) / `Otwórz ChatGPT`
  (`https://chatgpt.com/`), plus a footer button that closes this dialog and opens the
  paste-back dialog (`setShowAiModal(false); setShowCodeModal(true)`).
- the paste-back half is the sibling `showCodeModal` dialog (lines 458-493) whose
  `handleModalSubmit` (129-173) parses/stores the result.

`src/web/aiPluginPrompt.ts` — `buildAiPluginPrompt(description: string): string`. It inlines
`docs/PLUGINS.md?raw` and `plugin-types/index.d.ts?raw` into one big prompt with an explicit
"Output ONLY … in a single fenced code block" instruction.

`src/web/SubDialog.tsx` — `SubDialog({ title, onClose, children, footer, size, scrollable, dismissible })`.
Read its header comment: a react-bootstrap `<Modal>` **cannot** be used inside these panels
(portal + duplicate focus traps peg the CPU). This is why it renders inline.

### 2.2 What is reusable verbatim

| Piece | Verdict |
|---|---|
| `SubDialog` component | **Verbatim.** Works inside the popup body too. |
| `handleAiCopy` clipboard + `aiCopied` flash | **Verbatim**, rename symbols only. |
| The three-button row and the two chat URLs | **Verbatim.** |
| Two-dialog flow (compose → paste back) | **Verbatim shape**, different payload. |
| `buildAiPluginPrompt` | **Not reusable** — plugin-specific. Write a sibling. |
| `handleModalSubmit` (IndexedDB plugin storage) | **Not reusable** — replaced by §3. |

### 2.3 The generalisation

Create `src/web/assistant/buildAssistantPrompt.ts`:

```ts
export type AssistantIntent = 'settings' | 'alias' | 'trigger' | 'bind' | 'howto';

export function buildAssistantPrompt(
    question: string,
    kb: AssistantKb,            // from public/assistant-kb.json
    opts?: { intent?: AssistantIntent; selection?: string[] },
): string;
```

Structure it like `buildAiPluginPrompt` — a preamble, the request in `"""…"""`, hard output
requirements, then the reference material. Two differences that matter:

1. **Output must be JSON, not code.** Require exactly one fenced ```json block containing
   `{ "answer": "<polish prose>", "proposals": [ … ] }` matching `proposalTypes.ts`.
2. **The KB must be trimmed per intent.** `buildAiPluginPrompt` can afford to inline the whole
   of `PLUGINS.md` + the type declarations (~40 kB gzip in the Skrypty chunk — see the comment
   in `forge-ui/components/menu/MenuModalHost.tsx:6-19`). The full settings registry is far
   larger. Slice by intent: for `intent:'settings'` send only `assistantEditableKeys()` plus
   the descriptors whose `key`/`label` fuzzy-match the question (reuse `suggestSettingKeys`);
   for `intent:'trigger'` send the trigger schema + `SUPPORTED_EVENTS` + `GMCP_MSG_TYPES` only.
   Cap the prompt (~12 k chars) and tell the user if it was truncated.

Create `src/web/assistant/ClipboardBridgeDialog.tsx` — one component doing both halves:

```tsx
export interface ClipboardBridgeDialogProps {
    prompt: string;                       // already built
    onPaste: (raw: string) => void;       // receives the model's reply text
    onClose: () => void;
}
```
Render `SubDialog size="lg" title="Zapytaj zewnętrzny czat AI"` with: the same explanation
paragraph (reworded — "wklej odpowiedź", not "kod"), `Kopiuj prompt` / `Otwórz Claude` /
`Otwórz ChatGPT`, and a second textarea + `Wklej odpowiedź` button in the footer. On submit,
extract the first ```json fence, `JSON.parse`, run every proposal through
`validateProposal` (§3.0), and hand the survivors to the panel as normal proposal cards.
Never `eval`, never trust the fence content beyond `JSON.parse` + validation.

The same dialog is what tier 4 (BYOK) and tier 5 (Ollama) fall back to on failure, so keep
`prompt` as an input rather than building it inside.

---

## 3. The apply path — one function per proposal type

### 3.0 Shape and gate

> **Superseded — read `src/modules/core/assistant/proposalValidator.ts` instead.**
> The shape below was sketched before the validator was written and does not
> match it: the real kinds are `settingChange | alias | trigger | bind`
> (`ProposalKind`), the alias/trigger/bind proposals *are* the `UserAlias` /
> `UserTrigger` / `CustomBind` shapes with a `kind` and an optional `reason`
> rather than wrapping them in a named field, and a `settingChange` carries
> `key`/`value`. That validator is the authority for proposal shape across the
> whole assistant: the generated knowledge bundle and the Worker both follow it,
> and `test/shared/assistant/proposalSchemaAlignment.test.ts` fails if they
> drift. The prose below is still accurate about *where* each kind gets written.

`src/modules/core/assistant/proposalTypes.ts`:

```ts
export type Proposal =
  | { kind: 'setting'; key: string; value: unknown; rationale?: string }
  | { kind: 'alias';   alias: UserAlias;   replaceIndex?: number }
  | { kind: 'trigger'; trigger: UserTrigger; replaceIndex?: number }
  | { kind: 'bind';    slot: BindSlot; bind: Bind; command?: string };

export interface AssistantAnswer { answer: string; proposals: Proposal[]; kbVersion: string; }
```
(`UserAlias` from `@client/scripts/userAliases`, `UserTrigger`/`UserMacro` from
`@client/scripts/userTriggers`, `Bind` from `@modules/core/keymapTypes` — all type-only imports,
which the ESLint boundary permits even from `src/client`.)

`src/modules/core/assistant/validateProposal.ts` — pure, no storage, no DOM, returns
`{ ok: true; proposal: Proposal } | { ok: false; reason: string; suggestions?: string[] }`.
**Nothing reaches a card without passing this.**

### 3.1 Settings change

Two distinct backing stores. `lookupSetting(key).descriptor.scope` tells you which.

**(a) `scope === 'settings'` — character settings.** One flat blob under the character-scoped
key `settings` (`<Char>:settings`); shape is `Settings` in `src/modules/core/defaultSettings.ts`
(~55 mostly-flat fields).

Imitate `src/web/options/CharacterSettings.tsx:75-94` exactly:
```ts
import { characterStorage } from '@modules/core/storage';
const current = characterStorage.get('settings') ?? ({} as Settings);
characterStorage.set('settings', { ...current, [descriptor.field]: value });
```
Read-modify-write of the **whole** blob is mandatory — `TypedStorage.set` replaces the value.
35 client modules subscribe via `characterStorage.onChange('settings', …)`
(`src/client/Client.ts:140`, `src/client/People.ts:46`, …), so the change is live immediately.

**(b) `scope` is one of `shellSettings` / `renderSettings` / `mapSettings` / `behaviorSettings` / `uiSettings`.**

The accessors are in `src/modules/core/settings/index.ts`:
`get/setShellSettings`, `get/setRenderSettings`, `get/setMapSettings`, `get/setBehaviorSettings`,
`get/setDeviceViewSettings` (+ matching `on*SettingsChange`). `set` is a **merge-patch**
(`defineUiSettingsSlice` in `src/modules/core/settings/defineSettingsAccessor.ts`), so
`setRenderSettings({ showTimestamps: true })` preserves siblings.

> **Persisting is not applying.** `apply()` — the function that actually mutates fonts, colours,
> map, chrome — lives in `src/web/uiSettingsCore.ts:235` and is called **only** from
> `src/web/uiSettings/UiSettings.tsx:79` on its local draft. That component re-seeds its draft
> only from `globalStorage.onChange('uiSettings', …)` (`UiSettings.tsx:164`) — **not** from
> `renderSettings`/`shellSettings`/`mapSettings`/`behaviorSettings`. So a bare
> `setRenderSettings({...})` persists and syncs but has **no visible effect until reload**.
> Worse, in forge the `UiSettings` panel is lazy-loaded inside a modal
> (`forge-ui/components/menu/MenuModalHost.tsx:27`) and is usually not mounted at all.

Therefore, for **any** UI-settings proposal:
```ts
import { apply, load, save } from '@web/uiSettingsCore';
const next = { ...load(), [descriptor.field]: value };
save(next);   // fans out to all 5 backing keys (uiSettingsCore.ts:613)
apply(next);  // live effect — do not omit
```
This mirrors `UiSettings.onSave` (`save(normalized)`) plus its live-preview `apply(draft)`.
Yes, `save()` writes five keys and triggers five sync fan-outs; that is what the settings UI
already does on every save, so it is the sanctioned cost.

**Validation before either path:** `lookupSetting(key)`; on `ambiguous`/`unknown` reject and
surface `suggestions` in the card. Then type-check `value` against
`descriptor.type` / `enumValues` / `min` / `max` / `integer` / `length`.
**Reject `descriptor.type === 'complex'` outright** (`guildColors`, `zlomSilver`,
`collectOverrides`, `languageAliases`) — `assistantEditableKeys()` already filters those.

**Naive-call hazards:**
- Writing `localStorage.setItem` directly: no `fireListeners` in this tab ⇒ no live update, and
  **no Firebase sync trigger** (`syncEngine.ts:153-157` hooks only `onAnyChange`). Cross-tab
  still fires, producing the confusing "other tabs update, this one doesn't" asymmetry.
- Writing the `uiSettings` blob wholesale instead of via the slice accessor / `save()`: clobbers
  stock-chrome siblings that share the blob.
- Migrations (`src/modules/core/settingsMigrations.ts`) run once at bootstrap
  (`src/web/clientBootstrap.ts:40-48`), gated on the global `settingsMigrationsVersion`. Values
  written after that are never migrated — which is fine, because you write *current*-shape
  values. Do **not** invent a migration for assistant data.

### 3.2 User alias

Type (`src/client/scripts/userAliases.ts`):
```ts
export interface UserAlias { pattern: string; command: string; overrides?: Record<string,string>; }
```
Storage: global key `aliases` (`UserAlias[]`).

Apply — imitate `saveList` in `src/web/options/Aliases.tsx`:
```ts
import { globalStorage } from '@modules/core/storage';
const list = globalStorage.get('aliases') ?? [];
globalStorage.set('aliases', [...list, proposal.alias]);
```
`initUserAliases` subscribes with `globalStorage.onChange('aliases', …)` (userAliases.ts:86-91)
and re-registers the whole `client.aliases` list — **nothing else to call.**

Validate yourself; **nothing in the codebase does it for you**:
- `new RegExp('^' + pattern + '$')` in a try/catch — this is exactly how `apply()` compiles it,
  and an invalid pattern currently saves fine and only `console.error`s later.
- Non-empty trimmed `pattern` and `command`.
- Duplicate `pattern` against the existing list (imitate `isDuplicate` in
  `src/web/options/AliasEditModal.tsx`).
- ASCII-only outgoing command (see the Polish-diacritics rule in `aiPluginPrompt.ts:21`).
- Reject a `pattern` that shadows a built-in `/`-alias: check against
  `client.aliases.forCommand('/…')` or simply refuse patterns starting with `\/` that match a
  known built-in — an override here silently breaks stock features.

### 3.3 User trigger

Types (`src/client/scripts/userTriggers.ts:8-45`): `UserTrigger { type?: 'pattern'|'event'; pattern?; event?; flags?; gmcpMsgType?; macros: UserMacro[] }`,
`UserMacro { type: BuiltInMacroType|string; color?; to?; command?; soundKey?; label?; message?; pluginConfig?; dim*; wrap* }`.
Note there is **no** `isRegex` flag (pattern is always regex) and **no** `gag` macro type
(gagging lives in `LuaGagsSettings` / `registerGagTriggers`); colour is `type:'color'` + `color`,
sound is `type:'beep'` + `soundKey`.

Storage: global key `triggers` (`UserTrigger[]`). Apply mirrors §3.2 with
`globalStorage.set('triggers', …)`; `initUserTriggers` re-registers via
`globalStorage.onChange('triggers', …)` (userTriggers.ts:291-296), removing prior triggers by
the tag `'triggers'`.

**Action item:** `normalizeTrigger` / `normalizeTriggerList` / `normalizeMacro` are module-private
`function` declarations at `src/web/options/UserTriggers.tsx:111-125`. **Export them** (a
one-word diff) and call `normalizeTriggerList` before persisting, so the assistant path and the
settings-UI path cannot diverge. `src/web/options/TriggerEditModal.tsx:81` holds a *second*
private copy of `normalizeMacro` — leave it, but do not add a third.

Validate:
- `new RegExp(pattern, flags.includes('g') ? 'g' : '')` in try/catch (mirrors userTriggers.ts).
- `flags` ⊆ `{i, g, m}` (`AVAILABLE_FLAGS` in `TriggerEditModal.tsx`).
- `gmcpMsgType` ∈ `GMCP_MSG_TYPES` (exported, `UserTriggers.tsx:53`).
- `event` ∈ `SUPPORTED_EVENTS` (exported from **both** `userTriggers.ts:47` and
  `UserTriggers.tsx:90` — import from `@client/scripts/userTriggers`, the client copy is
  the one the runtime uses).
- macro `type` ∈ `BuiltInMacroType` ∪ `isTriggerMacroAvailable(type)`
  (`@modules/core/pluginTriggerMacroRegistry`).
- for `type:'event'`, macro type ∈ `{beep,mute,unmute,command,functionalBind,notify}`
  (`EVENT_COMPATIBLE_MACROS`, currently private in `TriggerEditModal.tsx` — export it too).
- ASCII-only regex (the project rule) — reject Polish diacritics in `pattern` with a clear
  Polish message telling the user to write `umarl`, not `umarł`.

### 3.4 Bind

Types: `src/modules/core/keymapTypes.ts` — `Bind { key: string /* KeyboardEvent.code */; ctrl?; alt?; shift? }`,
`CustomBind extends Bind { command: string }`, `BindSettings { main, mainGates?, mainTransport?, mainLoot?, lamp, attack, support, moveMode, roomBind, drinkable, doubleK, directions: DirectionBinds, custom: CustomBind[], temp: Bind[], enemy: Bind[], enemyBlock: Bind[] }`.

Storage is **three** keys: `keymaps` (the `KeymapStore`), `binds` (the *active* keymap's
`BindSettings`, what every runtime consumer reads), and `active_keymap_id` (per-device).

Apply — the single correct call is in `src/modules/core/keymapStorage.ts`:
```ts
import { getActiveKeymapId, getActiveBindSettings, saveKeymapBinds, mergeBindSettings } from '@modules/core/keymapStorage';
const merged = mergeBindSettings({ ...getActiveBindSettings(), custom: [...existing.custom, newCustomBind] });
saveKeymapBinds(getActiveKeymapId(), merged);
```
`saveKeymapBinds(keymapId, binds)` writes the keymap into `keymaps` **and**, only when
`keymapId === getActiveKeymapId()`, also `globalStorage.set('binds', binds)` — that second write
is what fires `KeyBindingManager` (`src/client/KeyBindingManager.ts:324`),
`directionBinds.ts:94`, `enemyBinds.ts:83`, `multibinds.ts:61`. Writing `keymaps` alone leaves
the bind dead until a keymap switch.

`mergeBindSettings(raw: any): BindSettings` is exported (`keymapStorage.ts:347`) and is **the one
existing structural validator you can reuse verbatim on an AI-proposed object** — it fills every
required field from `defaultBinds` and coerces array lengths.

**Conflict detection does not exist.** `src/modules/core/bindConflicts.ts` appeared in the
initial `git status` of this session but is **not on disk now** — do not assume it. If the
assistant may propose binds, you must write the check: compare the `key|ctrl|alt|shift` tuple
across `main*`, `lamp`, `attack`, `support`, `moveMode`, `roomBind`, `drinkable`, `doubleK`,
`directions.*`, `temp[]`, `enemy[]`, `enemyBlock[]`, `custom[]`. `bindMatches(ev, bind)` in
`keymapTypes.ts` is the only primitive available. Surface a conflict as a **warning on the card**,
not a hard reject — the user may genuinely want to rebind.

`sanitizeBinds` (drops `custom` rows with an empty key or command) is private in
`src/web/options/Binds.tsx:109` — replicate its two-line filter rather than exporting it, or
export it; either is fine, just do not skip it.

### 3.5 Sync — no work required

`binds` (`globalKeys: ['binds','keymaps']`), `triggers`, `aliases` are all declarative categories
in `src/modules/firebase/categoryRegistry.ts` (`group:'control'`, `scope:'shared'`, `speed:'hot'`).
Character `settings` rides the `characterSettings` custom exporter. The four UI slices are their
own categories. Every one of them syncs automatically because `TypedStorage.set` →
`fireListeners` → `onAnyChange` → `syncEngine.handleStorageChange` →
`syncDebounceManager` (30 s hot debounce) → `syncNow`. **Adding no category is the correct
outcome** — see §5 and §7.

---

## 4. The `/pomoc` alias

`/pomoc` is currently unused — `grep -r "/pomoc"` over `src/`, `docs/` returns nothing.

### 4.1 Script

New file `src/client/scripts/assistant.ts`, following the skill's standard signature:

```ts
import Client from "../Client";
import eventBus from "@modules/core/eventBus";

export default function initAssistant(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[],
) {
    aliases.push(
        {
            pattern: /^\/pomoc$/,
            callback: () => eventBus.emit('assistant.popup.open'),
        },
        {
            pattern: /^\/pomoc\s+(.+)$/,
            callback: (matches: RegExpMatchArray) =>
                eventBus.emit('assistant.popup.open', { question: matches[1].trim() }),
        },
    );
}
```

This is the same shape as `src/client/scripts/staticMapWindow.ts` (`/mapa` →
`eventBus.emit('staticmap.popup.open', …)`). Note ASCII-only regex; `/pomoc` has no diacritics.

### 4.2 Wiring (do not skip)

`src/client/main.ts`:
1. `import initAssistant from './scripts/assistant'` alongside the other imports (top of file).
2. `initAssistant(client, aliases)` inside `registerScripts(client)` (the body starts at line 165).
   Place it near `initStaticMapWindow(client, aliases)` (line 353). **Forget this and the script
   silently never runs; the build will not warn.**

### 4.3 The seam (why the event bus, not a port)

`src/client` may import `@modules/core/eventBus` freely — the ESLint boundary only blocks
`@web`/`@web-ui`. `eventBus` is the established client→UI seam for opening windows: 30+
`*.popup.open` events already live in `src/shared/events/clientEvents.ts`.

`@client/ports/uiPort.ts` is **not** the right seam here: `UiPort` covers only tooltips, context
menus and `shouldSuppressKeys`. Adding an `openAssistant()` method to it would force every UI
(including headless test hosts) to implement it, whereas an unhandled `eventBus.emit` is a
harmless no-op. Use the event bus.

### 4.4 Output back to the user

If the panel is unavailable (no UI listening), `eventBus.emit` returns `0`. Use that:
```ts
const listeners = eventBus.emit('assistant.popup.open', { question });
if (listeners === 0) client.print('Panel asystenta jest niedostepny w tym interfejsie.');
```
`client.print(printable: AnsiAwareBuffer | string)` / `client.println(...)`
(`src/client/Client.ts:335,343`). For coloured output follow the colour-leak rule in the
`adding-client-script` skill: always pass an explicit `{}` state to `append` after
`appendBuffer(colorString(...))`.

### 4.5 Docs

Add a row for `/pomoc` and `/pomoc <pytanie>` to `docs/ALIASES.md`. The skill treats missing
docs as an incomplete task. `docs/ALIASES.md` is already inlined into the in-client docs viewer
(`src/web/docs.ts:11`, key `aliases`, title "Inne"), so the entry shows up automatically.

---

## 5. BYOK API-key storage (per-device, never synced)

### 5.1 How sync actually decides

Two layers, and they differ:

- **Trigger layer = denylist.** `syncEngine.handleStorageChange` (`syncEngine.ts:596`) ignores
  only `FIREBASE_SETTINGS_KEY` and `FIREBASE_CONFIG_KEY`; any other `TypedStorage` write wakes
  the debouncer.
- **Payload layer, global keys = allowlist.** A global key is uploaded only if some
  `CATEGORY_REGISTRY` entry lists it in `globalKeys`, or a hand-written `customSync` branch in
  `src/web/options/exportUtils.ts` reads it by literal name. File export additionally gates on
  `KNOWN_GLOBAL_KEYS` (`exportUtils.ts:210`).
- **Payload layer, character-scoped keys = DENYLIST.** `exportCategory('characterSettings')`
  (`exportUtils.ts:825-847`) walks *all* of localStorage and uploads every `<Char>:<baseKey>`
  whose `baseKey` is in `characterStorageKeys` and is **not** in `EXCLUDED_LOCAL_STORAGE_KEYS`
  (`exportUtils.ts:132`). Adding a base key to `characterStorageKeys` therefore **auto-enrols it
  into cloud sync**.

### 5.2 Decision

Store the key as a **plain global localStorage key, written with raw `localStorage.setItem`,
absent from `GlobalStorageSchema`, `globalStorageKeys` and `CATEGORY_REGISTRY`.**

```
localStorage key: arkadia.assistantApiKey
```

Files to change: **none** in the sync layer. That is the point — it stays local *by omission*,
exactly like the existing per-device secrets. The `arkadia.` prefix is the established (convention-only)
marker for local-only keys.

Direct precedent, imitate it: `DRIVE_TOKEN_STORAGE_KEY = 'arkadia.driveToken'` in
`src/web/options/GoogleDriveTab.tsx:13`, read at line 25 and written at line 46 with raw
`localStorage`. It is an OAuth token and is never in any category. Other members of the same
family: `arkadia.firebaseDeviceId`, `arkadia.helperAutoLaunch`, `arkadia.helperBinds`,
`mccpEnabled`/`proxyMode`/`userProxyUrl` (`src/web/MudClient.ts:40-50`),
`DEVICE_STORAGE_KEYS` (`src/modules/device/deviceTypes.ts:104`).

`src/web/assistant/assistantKeyStore.ts`:
```ts
const KEY = 'arkadia.assistantApiKey';
export function getAssistantApiKey(): string | null { try { return localStorage.getItem(KEY); } catch { return null; } }
export function setAssistantApiKey(v: string | null): void { try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch {} }
```
The normal "never write raw localStorage" objection (§3.1) does **not** apply: no client module
subscribes to this key, and *not* firing the sync trigger is precisely the goal.

### 5.3 Traps

- **Do not** add it to `CharacterStorageSchema`/`characterStorageKeys` — that would enrol it
  into `characterSettings` upload. If a per-character key is ever unavoidable, you must also add
  its base key to `EXCLUDED_LOCAL_STORAGE_KEYS` (`exportUtils.ts:132`, consumed by
  `isExcludedLocalStorageKey` at line 159) — the **only** denylist mechanism in the codebase;
  `mapperRoomId` and `herbs_data` are the precedent.
- **Do not** reach for `scope: 'device'` in `CATEGORY_REGISTRY`. That is per-device but **still
  uploaded** (to `UnifiedSyncData.deviceCategories[deviceId]`). It is not a privacy mechanism.
- Consider `sessionStorage` instead if the key should not survive a browser restart —
  `PASSPHRASE_SESSION_KEY` (`syncEngine.ts:59`) is the precedent for the strongest isolation.
- **Add a guard test.** There is currently **no** test asserting a specific key is absent from
  the upload payload. Add one to `test/web/exportImport.test.ts`: seed
  `localStorage['arkadia.assistantApiKey']`, run `exportCategories(SYNC_CATEGORIES, chars)`,
  and assert the serialized payload does not contain the sentinel value.

---

## 6. Selection → "Zrób z tego trigger"

### 6.1 Selection already works, and the text is already ANSI-stripped

The game log renders ANSI as nested DOM spans, so `window.getSelection()` yields plain text
with no escape codes. Two further conveniences already in place:

- `src/web/outputContextMenu.tsx:87` already computes
  `const hasSelection = !window.getSelection()?.isCollapsed;` and lines 108-121 already gate
  two entries ("Kopiuj jako obraz", "Zapisz jako HTML") on it. **Extend that exact block.**
- Timestamp and message-type prefixes carry `user-select: none`, so they are **excluded** from
  the selection — `getSelectedContent()` in `src/web/copyOutputAsImage.ts:164` has to
  *re-prepend* them manually (lines 210-233). That means the selected string is already the raw
  game line, which is what a trigger pattern needs.

### 6.2 The seam

`export function setupOutputContextMenu(outputWrapper: HTMLElement, options?: OutputContextMenuOptions): () => void`
in `src/web/outputContextMenu.tsx:73`. It is called from **both** hosts —
`src/web/main.ts:251` (`setupOutputContextMenu(outputWrapper)`) and
`forge-ui/components/GameLog.tsx:139` (with `{ messageWrappersSupported: false }`). **One edit
covers both UIs.**

Gate the new entry on `hasSelection` only — not on `messageWrappersSupported`, which exists
solely because the copy-as-image/HTML path walks the `.output_msg` wrapper structure that forge
does not render. Selection text needs none of that.

```tsx
if (hasSelection) {
    items.push({
        label: iconLabel(Sparkles, 'Zrób z tego trigger'),
        action: () => {
            const text = window.getSelection()?.toString() ?? '';
            if (text.trim()) eventBus.emit('assistant.popup.open', { seedTriggerText: text });
        },
        opensWindow: true,
    });
}
```
`ContextMenuEntry` is `{ label: ReactNode | Node; action: () => void; opensWindow?: boolean }`
(`src/web/contextMenu/contextMenuStore.ts:3`). `iconLabel(Icon, text)` is the local helper at
`outputContextMenu.tsx:46`.

**Placement:** append **after** the existing selection entries and **before** the long
`/wiedza`-style block. Rationale: `e2e/context-menu.spec.ts` has a test that clicks
`menu.locator('button').first()` — keeping the metadata toggles first preserves it.

### 6.3 What `src/modules/core/contextMenus.ts` is (and is not)

That file holds `buildHerbContextMenuItems` and `openMapContextMenu` — pre-built menus for
herbs and map rooms, emitted from client-side code through `showContextMenu`. The output
context menu is **not** built there; it lives entirely in `src/web/outputContextMenu.tsx`.
Do not add the selection entry to `contextMenus.ts`.

### 6.4 Multi-line selections

`window.getSelection().toString()` joins visual lines with `\n`. Split on `\n`, drop blanks, and
pass the array — the KB prompt should ask the model for a multi-line trigger
(`Triggers.registerMultilineTrigger` semantics, i.e. `flags` containing `m`) when more than one
line is selected. If the user selected a partial line, the model gets a fragment; that is
acceptable — the confirm card shows the resulting regex and the user can edit it before applying.

---

## 7. Risks and things harder than they look

**R1 — Persisting a UI setting does not apply it.** The single biggest trap. See §3.1(b): the
`apply()` pipeline is bound to a React component's local draft, and it only re-seeds from the
`uiSettings` key. Under forge that component is usually not even mounted. Every UI-settings
proposal must call `save(next); apply(next)` from `@web/uiSettingsCore`. A test that only checks
localStorage will pass while the feature visibly does nothing.

**R2 — `src/modules/core/bindConflicts.ts` does not exist.** It was listed as untracked in this
session's opening `git status` but is absent from disk now. Any plan step that assumed it must
be rewritten. Either build conflict detection (§3.4) or drop `bind` from the proposal union for v1.
**Recommendation: drop binds from v1.** Settings + alias + trigger cover the stated goals; binds
add the only proposal type with no reusable validator and a real footgun (a bad bind can make the
client unusable and the user may not know how to undo it).

**R3 — No exported validators for aliases and triggers.** `normalizeTriggerList`,
`normalizeTrigger`, `normalizeMacro`, `EVENT_COMPATIBLE_MACROS` and `sanitizeBinds` are all
module-private. Copy-pasting them creates a third divergent copy (there are already two of
`normalizeMacro`). Export them from their current homes; that is a smaller, safer diff than
moving them.

**R4 — Two type definitions of `UserTrigger` already exist.** `src/client/scripts/userTriggers.ts`
and `src/web/options/UserTriggers.tsx` each declare `UserMacro`/`UserTrigger`/`SUPPORTED_EVENTS`
independently. The assistant must validate against the **client** copy (that is what the runtime
`apply()` consumes) while the settings UI edits the web copy. Import types from
`@client/scripts/userTriggers` and treat the web copy as UI-only.

**R5 — Prompt size.** `src/web/options/Scripts.tsx` already inlines `PLUGINS.md?raw` +
`plugin-types/index.d.ts?raw`, which is why the Skrypty chunk is ~40 kB gzip (documented at
`forge-ui/components/menu/MenuModalHost.tsx:6-19`). Naively inlining the whole KB into
`buildAssistantPrompt` will (a) blow past free-tier context limits and (b) fatten the assistant
chunk for every session. Load `public/assistant-kb.json` with `fetch` at panel-open time — never
`?raw` at build time — and slice it per intent.

**R6 — Untrusted model output.** The clipboard-bridge path lets a user paste arbitrary text.
`JSON.parse` + `validateProposal` only. Never `eval`, never `new Function`, never route a
proposal through the plugin path (`storePluginScript`) — that is a code-execution surface and
the assistant has no business touching it.

**R7 — Popout stylesheet drift.** Any new global CSS for the assistant must be added to
`popup/main.ts` or the detached panel renders unstyled. There is no automatic check.

**R8 — Re-registering the popup kills the popout.** Do not put `title` (or anything that changes
per message) in the `useDockablePopup` register-effect deps. Use `updatePopup(id, { title })`.

**R9 — `SubDialog`, never `<Modal>`.** Inside a panel or a Bootstrap-driven modal a portaled
react-bootstrap `<Modal>` pegs the CPU until the page stops responding
(`src/web/SubDialog.tsx:3-21`). This has already bitten this codebase once
(commit `bce4a890 fix(ui): render settings sub-dialogs inline to stop the focus-trap freeze`).

**R10 — Ollama tier needs the Go helper.** Tier 5 goes through `helper/`, which talks to the web
client over WebSocket (`src/modules/helper/`). That is a separate protocol addition on both
sides and should be the last tier implemented, if at all.

### Tests that will break or need touching

| Test | Why | Action |
|---|---|---|
| `test/modules/firebase/categoryRegistry.test.ts:18` | `expect(SYNC_CATEGORIES).toEqual([...21 exact ids in order...])` | Breaks **only if** a category is added. §5 adds none — keep it that way. |
| `e2e/context-menu.spec.ts` — "clicking a menu item hides the menu" | Clicks `menu.locator('button').first()` | Safe if the new entry goes after the metadata toggles (§6.2). Verify. |
| `e2e/context-menu.spec.ts` — "menu contains expected items" / "2-column layout" | Uses `toContainText`, and `columns: 2` | Unaffected by an added item. |
| `test/client/contextMenus.test.ts` | Only covers herb/map menus | Unaffected. |
| `test/web/exportImport.test.ts` | `isExcludedLocalStorageKey` cases | Add the BYOK-key-absence guard test here (§5.3). |
| `e2e/user-aliases.spec.ts` / `e2e/user-triggers.spec.ts` | Both assert the list starts at `toHaveCount(0)` | The assistant must never seed aliases/triggers on first run. |
| `e2e/popout.spec.ts` | Detach/restore via the loot popup | Good template for an `e2e/assistant.spec.ts`. |

### New tests to add

- `test/modules/core/assistant/validateProposal.test.ts` — hallucinated key → `unknown` +
  suggestions; out-of-range number; `complex` type rejected; bad regex rejected; Polish
  diacritics in a trigger pattern rejected.
- `test/client/scripts/assistant.test.ts` — `/pomoc` and `/pomoc <q>` emit the event with the
  right payload. Use the `FakeClient extends EventEmitter` template from
  `test/client/scripts/hpAlert.test.ts:7-17`; `localStorage.clear()` +
  `characterStorage.setCharacter('TestChar')` in `beforeEach`.
- `test/web/assistant/applyProposal.test.ts` — each proposal kind lands in the right storage key
  and fires listeners.
- `e2e/assistant.spec.ts` — `/pomoc` opens the panel; a stubbed proposal renders a card;
  "Zastosuj" writes the alias and the alias then fires in the game log.

---

## 8. Suggested build order

1. `proposalTypes.ts` + `validateProposal.ts` (pure, fully unit-testable, no UI).
2. Export the private normalizers (`UserTriggers.tsx`, `TriggerEditModal.tsx`).
3. `applyProposal.ts` + its unit test. No UI yet — drive it from a test.
4. `AssistantPopup.tsx` (clone `ChatPopup.tsx`) + `BuiltInPopupType` + `clientEvents.ts` +
   `POPUP_CATALOG`. Panel opens, shows canned messages.
5. `src/client/scripts/assistant.ts` + `main.ts` wiring + `docs/ALIASES.md` row.
6. `ProposalCard.tsx` — render + "Zastosuj"/"Odrzuć" → `applyProposal`.
7. Clipboard bridge (`buildAssistantPrompt` + `ClipboardBridgeDialog`). **Ladder tier 3 works
   end-to-end with zero backend** — ship here if the Worker slips.
8. `assistantClient.ts` → Worker `POST /ask` (tier 1) with cache (tier 2) falling back to 7.
9. `assistantKeyStore.ts` + BYOK settings inside the panel's own `SubDialog` (tier 4).
   Putting BYOK in the panel avoids adding a `ModalKey` to `MenuModalHost.tsx` **and** a
   `#…-modal` shell to `index.html` — two hosts, two edits, no benefit.
10. Output context menu entry (§6).
11. Footer chip (§1.4) — optional, 5 steps, lowest value.
12. Ollama via the helper (tier 5) — optional.
