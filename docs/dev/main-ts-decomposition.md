# Decomposing `src/web/main.ts` — towards a React-rendered shell

Plan agreed 2026-10-28. The goal is a stock UI whose page is rendered by **one React
tree**, with `main.ts` reduced to a short composition root. Each phase ships on its own
and keeps the e2e suite green.

## Where we start

`src/web/main.ts` was 1,548 lines of top-level statements:

| Concern | ~Lines | Nature |
|---|---|---|
| Connection lifecycle: flags, proxy reattach with backoff, tab-visibility checks, Safari keepalive, disconnect diagnostics | 450 | Logic, untested |
| Login screen: show/hide, server login message, password eye, autologin handshake | 250 | Imperative DOM over `index.html` |
| Map bootstrap: progress bar, `EmbeddedMap`, area reconciliation | 90 | Mostly logic |
| Wake lock (NoSleep), iOS keyboard offset, `?locationId=` | 90 | Platform glue |
| Output wiring: split view, double-tap close, context menu | 100 | Engine setup |
| Main-menu registration, modal plumbing via `window` events | 150 | Wiring |
| **21 separate `createRoot` islands** into `index.html` placeholders or detached divs | 150 | React islands, no shared context |

## What stays imperative, on purpose

React hosts these through a ref and never reconciles their children:

- **The game output** — `setupOutputMessageHandler` appends, trims and mirrors
  thousands of line nodes. Routing lines through React would cost a reconcile per line.
- **The map** — `EmbeddedMap` / mudlet-map-renderer draws its own canvas.
- **The game client** — built by `bootstrapGameClient` before React renders and passed
  down through context. `src/client` stays UI-agnostic, and a remount can never build a
  second client.

## Phases

### Phase 0 — headless controllers out of `main.ts` (no visual change)

Each piece exposes `getState()` + `subscribe()` so React can later read it with
`useSyncExternalStore`.

1. **`connection/connectionController.ts`** — connection state, sign-in handshake,
   proxy reattach, visibility checks, account-request queue. Unit-tested
   (`test/web/connection/connectionController.test.ts`). **Done.**
   `platform/wakeLock.ts` — NoSleep behind activate/deactivate/toggle. **Done.**
2. **`map/mapBootstrap.ts`** — map + colours load with progress as a store, `EmbeddedMap`
   creation, `onAreasChanged` reconciliation, `subscribeToMapData`. **Done.**
3. **`platform/iosViewport.ts`, `platform/initialLocation.ts`** — iOS keyboard offset
   and map layout offsets; the `?locationId=` one-shot. **Done.**
4. **`menu/mainMenu.ts`** — the built-in main-menu registrations (takes a `modals`
   handle and the connection controller). **Done.**

Phase 0 result: `main.ts` 1,548 → 1,018 lines; everything left in it is DOM wiring
and React mounting, which is what Phases 1–2 replace.

### Phase 1 — one React root

- `<App>` under `<AppProviders>` (client, connection controller, helper connection,
  account session in context) replaces the 21 `createRoot` calls.
- Islands that target `index.html` placeholders render there via `createPortal`;
  detached ones (buttons, widgets, boss key) become plain children.
- No DOM or CSS change, so e2e should pass untouched.

### Phase 2 — markup from `index.html` into components, region by region

**Every `id` and class stays verbatim** — e2e relies on them
(`#main_text_output_msg_wrapper` ×146, `#message-input` ×86, `#binds-modal` ×54…)
and so does the Kuźnia theme CSS.

1. **Modals** — the eight `app-modal` shells → `<AppModal id title size>`;
   `appModal.ts` + `window` events (`show-binds`, `close-options`,
   `OPEN_SETTINGS_EVENT`…) → a typed modal store, old events kept as adapters.
2. **Login** — `<AuthOverlay>`, `<LoginForm>`, `<SystemLoginMessage>` rendering the
   connection controller's state (replaces `updateConnectButtons` and
   `renderSystemLoginMessage`).
3. **Map chrome** — progress bar, location label, pause icon, lost badge; `<MapPane>`
   attaches `EmbeddedMap` by ref.
4. **`<GameOutput>`** — static shell (wrapper, split pane, sticky area, notification
   centre) rendered once; `setupOutputMessageHandler` and `installOutputSearch` run in
   its layout effect. Same pattern for the object lists.
5. **Footer leftovers** — commit info + update notice, recording button, wake-lock button.

End state: `index.html` is `<head>` + `<div id="root">`.

### Phase 3 — cleanup

- Delete `forge-ui/` (folded into the main UI as the Kuźnia theme) together with
  `connection/ConnectionEngine.ts`, which only it used; drop now-unused hooks such as
  `setLayoutOverrides` / `setObjectListChrome` if nothing else calls them.
- Remove the `window`-event adapters once nothing fires them.
- Update `AGENTS.md`: "Prefer creating HTML elements in HTML files" contradicts this
  direction.

## Target layout

```
src/web/
  main.ts                 # CSS, bootstrapGameClient, pre-mount flags, render(<App/>)
  app/App.tsx, AppProviders.tsx
  app/shell/GameOutput.tsx, MapPane.tsx, Footer.tsx
  auth/AuthOverlay.tsx, LoginForm.tsx, SystemLoginMessage.tsx
  connection/connectionController.ts, useConnection.ts
  modals/AppModal.tsx, AppModals.tsx, modalStore.ts
  map/mapBootstrap.ts
  menu/mainMenu.ts
  platform/wakeLock.ts, iosViewport.ts, initialLocation.ts
```

## Risks and rules

- **Init order.** `applyDefaultLayoutMode()` and `setRailSpanSupported()` must run
  before the layout mounts — keep them in `main.ts` before `render`. `CommandLine` is
  mounted with `flushSync` so `#message-input` exists for `installOutputSearch`; in the
  tree, make output search a child effect of `<GameOutput>` instead.
- **StrictMode** double-invokes effects in dev: every effect-hosted `install*/setup*`
  must be idempotent and return a teardown, or leave StrictMode off.
- **Keep `window.client`** — plugins and e2e use it.
- **Behaviour changes are called out per PR.** Phase 0 step 1 has one: the login
  screen's Połącz while already connected now goes through `requestDisconnect()`
  (disconnecting state + 1 s close fallback), the same path as the main menu, rather
  than a bare socket close.
