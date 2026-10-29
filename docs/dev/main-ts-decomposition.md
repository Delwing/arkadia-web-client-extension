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
4. **`<MapPane>`** — **done.** `app/shell/MapPane.tsx` renders `#iframe-container`
   with the download progress bar, holds `mapHost` at the default priority and
   renders `MapChrome` while it does; `installMapLayoutOffsets` is its effect.
   `EmbeddedMap` takes the host element, and `bootstrapMap` waits for the host to be
   placed as well as for the data. Until `<Shell>` (9) renders `#content-area`, the
   pane mounts into one `display: contents` point (`#map-pane-root`) where
   `#iframe-container` was.
5. **`<ObjectLists>`** — **done.** `app/shell/ObjectLists.tsx` attaches the list
   hosts straight into `#main-container` (direct children, as the vertical-rails
   grid places them). `ObjectList` takes the elements instead of looking them up,
   clears only its own content instead of `innerHTML = ""`, and clamps its saved
   position once the list is in the page (a detached element measured nothing and
   was reset to 0,0). Renders nothing itself until `<Shell>` renders `#main-container`.
6. **`<GameOutput>`** — **done.** `app/shell/GameOutput.tsx` renders the output
   wrapper, `#notification-center` with the toasts as a child (no portal) and the
   scrollback pane. `setupOutputMessageHandler`, the output context menu, output
   search, the double-tap/double-click close, the multibind and tab-return
   suppression and the toasts' viewport measure run in its layout effect; the lines
   stay the engine's (it only inserts before the pane and trims lines, never the
   strip or the pane). The client prints before the page renders, so
   `app/shell/outputHandle.ts` holds those messages and replays them through the
   engine (`appendMessage`) when it mounts; the character plaque reaches the engine
   through `getOutputHandler()`. `CommandLineDeps.getOutputWrapper` replaces the
   element, read when the command line mounts. Until `<Shell>` (9) renders
   `#content-area`, it mounts into `#game-output-root` (`display: contents`).
7. **Footer, command line, dock hosts** — **done, with 9.** `<Shell>` renders
   `#footer-layout` with `StockFooter`, `#command-line-root` with `CommandLine`, the
   `layout-*-dock-host` elements and the layout manager in place. `LayoutContent`'s
   dock portals look the hosts up again after their first render (`useHostElement`),
   since the shell renders them in the same commit.
   - **`<CompassRose>`** — **done.** `app/shell/CompassRose.tsx` draws
     `#compass-rose-box` (the grid or the ASCII drawing, special exits, the way
     back) from the `compassRose.box` event, asks for it on mount
     (`requestCompassRose`), and walks an exit on click through the client.
     `src/client/scripts/inlineCompassRose.ts` no longer touches the DOM.
   - **`<Footer>`** — **done.** `app/shell/Footer.tsx` renders `#footer-layout`;
     `setupMobileFooter` and the multibind `MutationObserver` are its effects.
8. **The log viewer's window** — **done.** `app/LogsWindow.tsx` renders
   `#logs-modal`, registers Logi in the main menu and the "Szukaj w logach"
   handler, and mounts `LogBrowser` (loaded lazily, as the separate entry kept it
   out of the main bundle) only while the window is open. `logBrowserMount.tsx`
   and its `<script>` tag are gone.
9. **`<Shell>` and region boundaries** — **done.** `app/shell/Shell.tsx` renders
   `#main-container` with everything that was in it, in the same order; `App.tsx`
   renders `<Shell>` and the overlays. `Island` is gone: `app/ErrorBoundary.tsx`
   wraps each region, and nothing is portalled into an index.html placeholder any
   more. The object lists' default place is the shell's own layout effect (a child's
   layout effect runs before its parent's refs are set, so a child cannot attach
   them between two of the shell's children). The click-to-focus handling on
   `#content-area` (`app/shell/contentAreaFocus.ts`) and the text column width
   measurer (in `<GameOutput>`) run once their elements exist; the measurer had
   silently stopped measuring at start-up when the output moved into the tree.
   `index.html`'s body is `<div id="root">` (`display: contents`), the two tooltip
   elements (`#map-note-tooltip`, `#hover-tooltip`, still filled imperatively) and
   the main script; the six unused placeholders are gone.
10. **`<Overlays>`** — **done.** `app/Overlays.tsx` holds what floats over the
    page: the menus, on-screen buttons, widgets and boss key (each renders into
    `document.body` itself) and the two tooltip elements, still filled by
    `mapNoteTooltip.ts` and `shared/dom/tooltip.ts`. `App.tsx` is `<Shell>` +
    `<Overlays>`.

**Phase 2 is done:** `index.html`'s body is `<div id="root">` and the main script.

**Done when** `index.html`'s `<body>` is `<div id="root"></div>` plus the script
tags, and `grep createPortal src/web/app` finds no placeholder target.

### Phase 3 — cleanup

- **Delete `forge-ui/`** — **done.** The app, its Vite entry and `tsconfig`
  include, its unit tests (`test/forge-ui/`), the five specs that opened
  `/forge-ui/` and the two forge tests in the footer-layout specs, the SCSS options
  only its Bootstrap file used, `connection/ConnectionEngine.ts` (only it used that)
  and `MovableHost.adopt`. The stock UI's Kuźnia theme and its specs
  (`forged-login`, `forged-theme`) stay.
  Still open, as one follow-up: the seams that existed only for a second shell and
  the ~100 comments that still describe forge as a consumer —
  `setLayoutOverrides` / `getLayoutOverrides`, `setDockingSupported`,
  `setObjectListChrome` / `objectListChrome`, `setPopoutEntry`,
  `LayoutManagerWrapper`'s `renderObjectList` / `objectListTitle`, the output
  engine's `buildMessageNode` hook. Each needs its stock default checked before it
  goes. The `sass` dev dependency is unused now too (dropping it changes
  `yarn.lock`).
- **Typed window API instead of `window` events** — **done.** `modals/pageWindows.ts`
  (`openWindow`, `closeWindow`, `closeOptionWindows`, over the `AppModal`
  controller) replaces `close-options`, `show-binds`, `show-character-management`,
  `OPEN_SETTINGS_PAGE_EVENT` and `CLOSE_SETTINGS_EVENT`; `openSettingsPage`,
  `openPlace` and the assistant's `openSettingsFor` open their window themselves.
  Two events stay, for what they tell the window's content rather than for opening
  it: the place event (which room Miejsca selects) and the assistant's (which page
  the dialog shows). `show-export-import` stays too: it comes from
  `src/modules/firebase/syncEngine.ts`, which must not import the UI, and
  `<AppModals>` answers it. Character management refreshes on its window's own
  `MODAL_EVENT.show`.
- Move the remaining `main.ts` wiring into the components it belongs to (focus
  handling into `<GameOutput>`/`<CommandLine>`, the settings/places event listeners
  into `<AppModals>`), leaving `main.ts` as CSS, `bootstrapGameClient`, the pre-mount
  flags and `render(<App/>)`.
- **Update `AGENTS.md`** — **done.** The HTML rule now says the page is one React
  tree (markup goes in the region's component, never `index.html`; no placeholder
  portals; an `ErrorBoundary` per region; engine-owned elements are `MovableHost`s),
  and the forge references are gone. `docs/CLIENT_UI_DECOUPLING.md` notes that
  forge-ui was removed.

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
