# In-client AI assistant — integration

Dev-facing. How the assistant plugs into the client, and what is still open.

The first version of this file was the build plan. Most of it shipped (commit
`76a9589f` and follow-ups); this version describes what exists and keeps only the
remaining items as plan.

Invariants:

- `src/client/**` must not import `@web`/`@web-ui` at runtime (ESLint boundary rule;
  type imports are allowed).
- `data/` is never modified.
- Regex literals in `src/client` are ASCII-only. UI strings are Polish.

---

## 1. What exists

| Piece | Where |
|---|---|
| Proposal shape + validation (the authority for `settingChange \| alias \| trigger \| bind`) | `src/modules/core/assistant/proposalValidator.ts` |
| Editable-settings registry (`lookupSetting`, `suggestSettingKeys`, `assistantEditableKeys`) | `src/modules/core/assistant/settingsRegistry.ts` |
| The panel, `popup:assistant` | `src/web/AssistantPopup.tsx`, registered in `src/web/popups/popupCatalog.tsx` |
| Open event `assistant.popup.open` (`{ question?, seedTriggerText? }`) | `src/shared/events/clientEvents.ts` |
| `/pomoc`, `/pomoc <pytanie>` | `src/client/scripts/assistant.ts`, wired in `src/client/main.ts`, listed in `docs/ALIASES.md` |
| "Zapytaj asystenta" from the docs viewer | `src/web/documentation/DocsView.tsx` |
| Transport: Worker `POST /ask` (SSE), BYOK fallback | `src/web/assistant/assistantClient.ts`, `sseStream.ts`, `proposalFence.ts` |
| System prompt / user message for the BYOK path | `src/web/assistant/buildAssistantPrompt.ts` |
| Knowledge bundle loading | `src/web/assistant/knowledgeBundleClient.ts` (bundle built by `scripts/build-assistant-kb.ts`) |
| Proposal card, description, bind-conflict warnings | `src/web/assistant/ProposalCard.tsx`, `describeProposal.ts` (uses `src/modules/core/bindConflicts.ts`) |
| Apply — the **only** place a proposal is persisted | `src/web/assistant/applyProposal.ts` |
| Trigger normalization shared with the settings UI | `src/web/options/userTriggerNormalize.ts` |
| "Open this settings panel" hints | `src/web/assistant/detectPanelHint.ts`, `PanelHintCard.tsx`, `openSettings.ts` |
| Per-device settings (BYOK key, Worker URL, BYOK base URL/model, prefer-BYOK) | `src/web/assistant/assistantKeyStore.ts`, UI in `AssistantSettingsDialog.tsx` |
| The Worker | `services/ai-worker/` |
| Tests | `test/modules/core/assistant/`, `test/web/assistant/`, `test/client/scripts/assistant.test.ts`, `e2e/assistant.spec.ts`, BYOK-key guard in `test/web/exportImport.test.ts` |

The clipboard-bridge tier (copy a prompt to an external chat, paste the reply back)
from the original plan was not built: the Worker plus the BYOK fallback replaced it.

---

## 2. Rules that still bite

**Persisting a UI setting does not apply it.** A bare `setRenderSettings({...})`
persists and syncs but has no visible effect until reload. UI-settings proposals go
through `save(next); apply(next)` from `@web/uiSettingsCore` — `applyProposal.ts`
does this; keep it that way. A test that only checks localStorage passes while the
feature visibly does nothing.

**Binds: write through `saveKeymapBinds`.** It writes `keymaps` and, for the active
keymap, `binds` — the second write is what the runtime listens to. Writing `keymaps`
alone leaves the bind dead until a keymap switch.

**The BYOK key stays local by omission.** Every key in `assistantKeyStore.ts` is
written with raw `localStorage`, under the `arkadia.` prefix, and is absent from
`GlobalStorageSchema`, `globalStorageKeys` and every sync type. Never add one to
`characterStorageKeys` (that enrols it in sync) and never use a device-scoped sync
type (still uploaded). The guard test in `test/web/exportImport.test.ts` must keep
passing.

**Untrusted model output.** Proposals are `JSON.parse` + `validateProposal` only.
Never `eval`, never `new Function`, never route anything through the plugin path.

**Popout.** Don't put `title` (or anything that changes per message) in the
`useDockablePopup` register-effect deps — re-registering snaps a popped-out window
back. Use `updatePopup(id, { title })`. A new global stylesheet for the assistant
must also be imported in `views/popup/main.ts`.

---

## 3. Open items

### 3.1 "Zrób z tego trigger" in the output context menu

The receiving half is done: `AssistantPopup` turns `seedTriggerText` into
"Zrób trigger na taką linię z gry: …" in the input. Nothing sends it yet.

Add an entry to the `Zaznaczenie` section of `buildOutputContextMenuItems` in
`src/web/outputContextMenu.tsx` (the menu is attached in
`src/web/app/shell/GameOutput.tsx`). The function receives the raw selection; use
it, not the whitespace-collapsed `selected`, so multi-line selections keep their
lines:

```tsx
items.push({
    section,
    label: 'Zrób z tego trigger',
    icon: Sparkles,
    action: () => eventBus.emit('assistant.popup.open', { seedTriggerText: selection }),
});
```

Timestamp and message-type prefixes are `user-select: none`, so the selection is
already the raw game line. Check `e2e/context-menu.spec.ts` — some tests click the
first button of the menu.

### 3.2 Footer chip (optional, low value)

The stock footer now renders the shared registry (`prepareStockFooter` →
`registerBuiltinFooterItems`), so one chip covers it. Steps:

1. `AssistantChip` in `src/ui/web/footer/chips.tsx`, using `Chip` and `ChipIcon`.
2. An entry in `CHIPS` in `src/ui/web/footer/builtinItems.tsx`.
3. The id in `defaultFooterComponents` (`src/web/defaultUiSettings.ts`) —
   `validateFooterComponents` drops ids that are not there.
4. A Polish name in `CHIP_NAMES` (`src/ui/web/footer/chipNames.ts`).

### 3.3 Local model via Ollama (optional, last)

Not started. It would go through the native helper (`services/helper/`, WebSocket
protocol in `src/modules/helper/`) — a protocol addition on both sides. Unless that
is wanted for other reasons, pointing the BYOK base URL at a local
OpenAI-compatible endpoint may already cover it; check before building anything.
