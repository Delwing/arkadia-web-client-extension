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

**Done.** `src/web/app/App.tsx` renders every part of the page as an `<Island>`
(`app/Island.tsx`): a per-part error boundary, so one failing component still only
empties its own spot as a separate root did, plus a portal into its `index.html`
element. Services come from `app/appServices.ts` via `<AppProviders>`. `main.ts`
renders the tree once with `flushSync`, after `FightTitle`/`HpTitle`/`ObjectList`
exist and before `setupMobileFooter`. Toasts are set up by `setupToasts` and rendered
by the tree; the footer's registry/preview setup is `prepareStockFooter`. The map
labels no longer wait for the map: they ask `MapHelper` for the current state on
mount. Roots created on demand elsewhere (output search, log browser, confirm
dialog, plugin footer items) are untouched.

### Phase 2 — markup from `index.html` into components, region by region

**Every `id` and class stays verbatim** — e2e relies on them
(`#main_text_output_msg_wrapper` ×146, `#message-input` ×86, `#binds-modal` ×54…)
and so does the Kuźnia theme CSS.

1. **Modals** — **done.** The shells live in `app/AppModals.tsx` on
   `modals/AppModalShell.tsx` (same markup), rendered into `#app-modals`
   (`display: contents`) where index.html held them. The `AppModal` controller is
   kept as is: it is imperative, small, and used by several panels; `main.ts` looks
   modals up lazily with `AppModal.byId`. `#logs-modal` stays in index.html, because
   `logBrowserMount.tsx` (a separate entry) empties its body and mounts its own root.
   Still open: the `window` events (`show-binds`, `close-options`,
   `OPEN_SETTINGS_EVENT`…) → a typed modal store.
2. **Login** — **done.** `auth/AuthOverlay.tsx` (+ `auth/CommitInfo.tsx`) renders
   the controller's and the account session's state, into `#auth-root`.
   `updateConnectButtons` keeps only the command line's connection view and the
   menu's Połącz/Rozłącz.
3. **Map chrome** — **blocked as planned.** The layout manager moves `#map`,
   `#location-wrapper` and `#map-lost-wrapper` into dock panels and back
   (`layout/panels/MapPanel.tsx`), and `ObjectListPanel` does the same with
   `#objects-list`. React cannot own nodes something else re-parents: its fiber
   tree would point at the wrong parent and the next removal throws. Their
   *content* already renders from the tree by portal (Phase 1). To go further, the
   panels must first take React-rendered panes (render the map host inside
   `MapPanel` and pass the element to `EmbeddedMap`) instead of moving DOM.
4. **`<GameOutput>`** — **deferred** for the same reason in spirit: the output
   wrapper's children are appended and trimmed by `setupOutputMessageHandler`, so
   React would own only a static frame. Worth doing together with the panel change
   in 3, not on its own.
5. **Footer leftovers** — **done.** Commit info is in `CommitInfo`; the recording
   button is `app/shell/RecordingStopButton.tsx`. The wake-lock button code was
   dead (no `#wake-lock-button` exists) and is removed.

Revised end state for this phase: `index.html` keeps the static hosts the
imperative engines own (`#iframe-container` with the map, the output wrapper,
the object lists, `#logs-modal`, the dock hosts) and empty `display: contents`
mount points; everything else renders from the tree. The full `<div id="root">`
needs the panel rework above first.

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
