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

## End state

React renders the whole page: `index.html` is the `<head>` and one `<div id="root">`,
and `src/web/app/App.tsx` reads like the page, one component per region:

```
<App>
  <Shell>                    #main-container / #content-area
    <MapPane/>               map host, location label, pause icon, lost badge, progress
    <GameOutput/>            output wrapper, split pane, sticky area, toasts
    <CompassRose/>
    <Footer/>                StockFooter
    <ObjectLists/>
    <CommandLine/>
    <DockHosts/>             layout dock hosts + the layout manager
  </Shell>
  <AuthOverlay/>
  <AppModals/>               every page-level window, the log viewer's included
  <Overlays/>                buttons, widgets, boss key, context menu, playback, tooltips
</App>
```

Each region has an error boundary of its own, and **no component is portalled into
an `index.html` placeholder**. Portals remain only where a component deliberately
renders into `document.body` (overlays, menus), which is what portals are for.

### What stays imperative, on purpose

Only the *inside* of two engines, hosted by a component through a ref; React renders
their containers but never their children:

- **The game output's lines** — `setupOutputMessageHandler` appends, trims and mirrors
  thousands of line nodes. Routing lines through React would cost a reconcile per line.
- **The map's drawing** — `EmbeddedMap` / mudlet-map-renderer draws its own canvas.

Plus, outside the DOM, **the game client** — built by `bootstrapGameClient` before
React renders and passed down through context. `src/client` stays UI-agnostic, and a
remount can never build a second client.

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

Done along the way: the build line and new-version notice (`auth/CommitInfo.tsx`),
the recording stop button (`app/shell/RecordingStopButton.tsx`); the wake-lock
button code was dead (no `#wake-lock-button` exists) and is removed.

3. **Layout manager stops moving page markup** — **done.** `#map`,
   `#objects-list` and `#objects-list-others` are created in code
   (`app/shell/mapHosts.ts`), not in index.html, and moved by
   `layout/movableHost.ts`: places attach to a host and detach again, and the host
   sits in the attached place with the highest priority (default spot 0, a layout
   panel 1). `MapPanel` and `ObjectListPanel` attach while mounted instead of moving
   nodes by hand and restoring them. React renders the places, never the hosts, so
   moving a host is safe. Only those three elements move, because their contents
   belong to an engine (`EmbeddedMap`, `ObjectList`) and must survive the move. The
   location label, pause icon and lost badge are plain React now (`MapChrome`),
   rendered by whichever place holds the map: they ask for their state on mount, the
   pause icon reads a shared store, and `ObjectList`'s picture-in-picture header
   follows the `mapLocationLabel` event instead of watching `#location-text`.
   The default places are still `#iframe-container` and `#main-container` in
   index.html, attached in `main.ts` at startup; 4 and 5 make them components.
4. **`<MapPane>`** — `#iframe-container` and the download progress bar as a
   component that holds `mapHost` at the default priority and renders `MapChrome`
   while it does; `EmbeddedMap` takes the host element instead of querying `#map`.
   `installMapLayoutOffsets` becomes its effect.
5. **`<ObjectLists>`** — the object lists' default place as a component holding
   their hosts; `ObjectList` takes the host elements instead of looking them up, and
   stops clearing its container (`innerHTML = ""`), which today only works because it
   runs before any panel adds its timers bar.
6. **`<GameOutput>`** — the output wrapper, split pane, sticky area, close button and
   `#notification-center` (toasts as a child, not a portal). `setupOutputMessageHandler`,
   `installOutputSearch`, the output context menu and the double-tap/double-click
   handlers run in its layout effect; the lines stay the handler's.
7. **Footer, command line, compass rose, dock hosts** — `StockFooter` and
   `CommandLine` rendered by `<Shell>` in place instead of portalled into
   `#footer-layout` / `#command-line-root`; the `layout-*-dock-host` elements in JSX;
   the layout manager rendered by `<Shell>`. `#compass-rose-box` needs one step first:
   `src/client/scripts/inlineCompassRose.ts` reads it with `document.getElementById`
   and builds its rows itself, which also breaks the client's no-DOM rule. Its state
   goes out through an event or the UI port, and a `<CompassRose>` component renders it.
   `setupMobileFooter` and the multibind `MutationObserver` become effects of `<Footer>`.
8. **The log viewer's window** — `#logs-modal` moves into `<AppModals>`, and
   `logBrowserMount.tsx` stops being a separate entry: `LogBrowserWindow` renders in the
   shell, still loading `LogBrowser` lazily.
9. **`<Shell>` and region boundaries** — `#main-container` / `#content-area` in JSX;
   `Island` is replaced by an `ErrorBoundary` per region (and per page-level window),
   and the portal half of `Island` is deleted once 3–8 have removed its last use.
   `index.html` drops the six placeholders nothing references any more
   (`knowledge-root`, `knowledge-details-root`, `clock-root`, `contracts-root`,
   `letter-composer-root`, `herb-ui-root`), then everything but `<div id="root">`.

**Done when** `index.html`'s `<body>` is `<div id="root"></div>` plus the script
tags, and `grep createPortal src/web/app` finds no placeholder target.

### Phase 3 — cleanup

- Delete `forge-ui/` (folded into the main UI as the Kuźnia theme) together with
  `connection/ConnectionEngine.ts`, which only it used; drop now-unused hooks such as
  `setLayoutOverrides` / `setObjectListChrome` if nothing else calls them.
- Replace the `window` events that open and close windows (`show-binds`,
  `close-options`, `show-character-management`, `OPEN_SETTINGS_EVENT`…) with a typed
  modal store, keeping the events as adapters until nothing fires them, then remove them.
- Move the remaining `main.ts` wiring into the components it belongs to (focus
  handling into `<GameOutput>`/`<CommandLine>`, the settings/places event listeners
  into `<AppModals>`), leaving `main.ts` as CSS, `bootstrapGameClient`, the pre-mount
  flags and `render(<App/>)`.
- Update `AGENTS.md`: "Prefer creating HTML elements in HTML files" contradicts this
  direction.

## Target layout

```
src/web/
  main.ts                 # CSS, bootstrapGameClient, pre-mount flags, render(<App/>)
  app/App.tsx, AppProviders.tsx, appServices.ts, ErrorBoundary.tsx
  app/shell/Shell.tsx, MapPane.tsx, GameOutput.tsx, ObjectLists.tsx, Footer.tsx,
            CompassRose.tsx, DockHosts.tsx, Overlays.tsx, RecordingStopButton.tsx
  auth/AuthOverlay.tsx, CommitInfo.tsx
  connection/connectionController.ts
  modals/appModal.ts, AppModalShell.tsx, modalStore.ts   (+ app/AppModals.tsx)
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
