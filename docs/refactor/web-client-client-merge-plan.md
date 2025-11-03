# Merge Plan: Unifying `client` and `web-client` modules

## Goals
- Eliminate duplicated utilities, event definitions, and UI infrastructure spread across `client` and `web-client`.
- Simplify shared build/testing pipelines by converging on a single TypeScript/Vite toolchain.
- Ensure extension and standalone web app continue to ship with required bundles without regressing runtime behavior.

## Guiding Principles
- Favor extraction into clearly named shared packages (e.g. `src/shared`) before relocating module-specific code.
- Keep slices small enough to land inside a regular review window (<~300 LOC diffs).
- Maintain green status (`yarn --cwd web-client test`, `yarn --cwd web-client build`) after each slice.
- Mirror exports gradually; avoid “flag day” deletes until both sides compile against new code.

## Slice 1 — Shared Event Contracts
1. Create `src/shared/events/` with a single source of truth for `eventBus` types (`ClientEvents`, `SendCommandEvent`, etc.).
2. Update `client` and `web-client` imports to read from the shared module.
3. Delete duplicated type declarations once both sides compile.

## Slice 2 — Shared DOM Utilities
1. Move `context menu`, timestamp helpers, and message formatting into `src/shared/dom/`.
2. Adjust both bundles to import from the shared path.
3. Update unit tests to mock shared helpers instead of local copies.

## Slice 3 — Recorder / History Unification
1. Relocate the TypeScript `Recorder` implementation to `src/shared/recorder/`.
2. Provide thin “adapter” wrappers in each bundle that inject platform-specific hooks (e.g. storage paths).
3. Remove direct references to `window.clientExtension` in recorder logic.

## Slice 4 — Client Registry Consolidation
1. Promote `clientRegistry` into `src/shared/runtime/`.
2. Ensure both entry points (`client` background scripts and `web-client` SPA) register through the same helper.
3. Update Playwright/Jest helpers to reference `globalThis.clientExtension` via the shared registry.

## Slice 5 — Map & Location Services
1. Extract `MapHelper`, map loaders, and location-restoration logic into `src/shared/map/`.
2. Introduce explicit interfaces for renderer interactions to keep Mudlet-specific calls isolated.
3. Retire duplicate `loadMapData` / `loadColors` wiring by pointing both bundles at the shared loader.

## Slice 6 — Split Socket vs UI Responsibilities
1. Create `src/shared/socket/` containing WebSocket handshake, recorder hooks, and GMCP plumbing currently in `web-client/src/ArkadiaClient.ts`.
2. Move web UI components (`KnowledgeReport`, `HerbManager`, mobile controls) into `src/ui/web/`, leaving generic DOM helpers in `src/shared/ui/`.
3. Update imports so the extension runtime reuses socket helpers, while the SPA reuses UI modules, avoiding cross-dependencies.

## Slice 7 — Incremental React Component Extraction
1. Identify non-React UI islands (status panels, modal controls, settings forms) and migrate them one-by-one into typed React components under `src/ui/web/components/`.
2. Maintain imperative wrappers during migration so legacy scripts can mount/unmount new components without large rewrites.
3. Explicitly exclude the map renderer and main output div from this pass; they remain imperative until a dedicated rendering strategy is approved.

## Slice 8 — Build/Config Alignment
1. Move TypeScript `tsconfig` bases into `tsconfig.base.json`; have both projects extend from it.
2. Standardize Jest/Playwright configs to import shared setup scripts.
3. Verify CI jobs can run with a single `yarn test` and `yarn build` entry point.

## Slice 9 — Final Module Flattening
1. Relocate remaining `client/src` and `web-client/src` feature modules into consolidated `src/modules/`.
2. Update path aliases (`@client/*`, `@web/*`, etc.) to resolve to the new shared locations or UI-specific roots.
3. Remove legacy package boundaries and deprecated scripts.

## Cross-Slice Checks
- Keep release artifacts (extension bundle & web app) manually smoke-tested after slices 3, 5, and 7.
- Document newly shared utilities in `docs/` as they stabilize to ease future onboarding.
