# AGENTS

This document provides context for AI agents working on this codebase.

## Project Overview

Arkadia Web Client Extension is a browser-based client for the Arkadia MUD (Multi-User Dungeon) game. It features:
- A React web interface for settings, displays, and UI management
- A client script system for game interaction
- A plugin editor for users to write custom scripts
- A session log viewer
- Map visualization, combat tracking, and chat history

## Tech Stack

- **Framework**: React 19 with TypeScript 5.8
- **Build Tool**: Vite 7 (multi-entry: client + editor + viewer + log-viewer)
- **UI**: React-Bootstrap + Bootstrap 5
- **Code Editor**: Monaco Editor with Shiki syntax highlighting
- **Backend**: Firebase
- **Special**: lua-in-js (Lua interpreter), sql.js (SQLite in WASM), esbuild-wasm
- **Testing**: Jest (unit) + Playwright (e2e)

## Directory Structure

```
src/
├── client/           # Client-side scripts for Arkadia interaction
│   ├── scripts/      # Feature-specific scripts (150+ modules)
│   ├── lua/          # Lua scripts for combat coloring and magics
│   ├── ansi/         # ANSI color/formatting handling
│   ├── Triggers.ts   # Trigger system for game events
│   ├── PluginManager.ts  # External plugin management
│   ├── Client.ts     # Core client class
│   └── main.ts       # Client entry point (loaded dynamically by web app)
├── web/              # React web application
│   ├── hooks/        # React hooks (popups, drag, scroll)
│   ├── options/      # Settings interface (45+ components)
│   ├── *.tsx         # Popup and display components (flat structure)
│   ├── *.ts          # Timers, state, and utilities
│   └── main.ts       # Web entry point
├── shared/           # Code shared between client and web
│   └── events/       # Custom event system (eventBus)
├── modules/          # Modular functionality
│   ├── core/         # Settings, storage, event bus, plugin registries
│   ├── data/         # Data stores, people loader, IndexedDB strategies
│   ├── firebase/     # Firebase auth, sync, and device sync
│   └── device/       # Device management and settings bundles
└── ui/web/           # Component mounting utilities

editor/               # Plugin editor application (separate entry point)
viewer/               # Session log viewer (separate entry point)
log-viewer/           # Alternative log viewer (separate entry point)
helper/               # Native helper app (Go) — system tray, hotkeys, window mgmt
plugin-types/         # Auto-generated TypeScript types for plugin API
examples/             # Example plugins
docs/                 # User-facing documentation
test/                 # Jest unit tests (mirrors src/ structure)
e2e/                  # Playwright end-to-end tests (100+ specs)
data/                 # Game data (DO NOT MODIFY)
```

## Path Aliases

Use these TypeScript path aliases (defined in `tsconfig.base.json`):
- `@client` → `src/client`
- `@web` → `src/web`
- `@shared` → `src/shared`
- `@modules` → `src/modules`
- `@web-ui` → `src/ui/web`

## Development Commands

```bash
yarn dev          # Start dev server
yarn build        # Production build (Vite)
yarn test         # Run unit tests (Jest)
yarn test:e2e     # Run end-to-end tests (Playwright)
yarn lint         # Run ESLint
yarn preview      # Preview production build
```

## CI Pipeline

CI runs on **ubuntu-latest** with **Node 24** and `yarn install --frozen-lockfile`.
Your code must pass: `yarn build` + `yarn test` + `yarn test:e2e` (8 Playwright shards).
The helper app builds with **Go 1.24** for Windows/macOS/Linux.
On master, plugin types are built (`yarn build:types`) and everything deploys to GitHub Pages.

## Testing Requirements

**Always run tests before completing a task.**

1. Run `yarn test` for unit tests
2. Run `yarn test:e2e` for end-to-end tests
3. Ensure `yarn build` completes without errors

## Test Conventions

- **Unit tests** (`test/`): mirror the `src/` directory structure. E.g., `src/client/Triggers.ts` → `test/client/Triggers.test.ts`
- **E2E tests** (`e2e/`): flat directory, one `*.spec.ts` per feature
- **Mocks**: `test/__mocks__/` for module mocks, `jest.setup.js` for global setup
- Test environment: jsdom for unit tests, Chromium for e2e

## Coding Guidelines

### General
- Use `yarn`, never `npm`
- Prefer ESM imports (`import`/`export`)
- Follow existing code patterns in the codebase

### Imports
- Path aliases (`@client`, `@web`, `@shared`, `@modules`, `@web-ui`) are used for both cross-module and intra-module imports
- Alias imports include `.ts`/`.tsx` extensions: `from "@client/ansi/FormatState.ts"`
- Relative imports omit extensions: `from "./Client"`

### HTML/Components
- Prefer creating HTML elements in HTML files when possible
- Do not use `aria-*` attributes (not needed in this project)

### Regular Expressions
- Never include Polish letters in regex patterns
- Keep patterns ASCII-compatible

### Styling
- Use React-Bootstrap components where appropriate
- Follow existing CSS patterns

## Protected Directories

**Never modify files inside the `data/` directory.** This directory contains game data that should remain unchanged.

## Entry Points

There are four Vite build entries (see `vite.config.ts`):
- **Client**: `index.html` → `src/web/main.ts` - Main web application
- **Editor**: `editor/index.html` → `editor/main.ts` - Plugin editor
- **Viewer**: `viewer/index.html` → `viewer/main.tsx` - Session log viewer
- **Log Viewer**: `log-viewer/index.html` → `log-viewer/main.tsx` - Standalone log viewer

The client-side scripts entry is `src/client/main.ts` (loaded dynamically by the web app, not a Vite entry itself). It bootstraps the `Client` class which manages triggers, plugins, and game communication.

## Key Architecture Patterns

### Event System
The project uses a custom event bus in `src/modules/core/eventBus.ts` with typed events defined in `src/shared/events/`. All cross-module communication goes through events. Check existing event handlers for patterns.

### Trigger System
`src/client/Triggers.ts` is the core game interaction mechanism:
- Triggers match game output lines using regex patterns, string patterns, or custom match functions
- Triggers can have **children** (sub-triggers that only activate when parent matches)
- Support `stayOpenLines` (parent stays active for N lines after matching)
- Triggers can be tagged and removed by tag (used for plugin cleanup)
- Pattern can be a single pattern or an array (multi-line sequence matching)

Most scripts in `src/client/scripts/` register triggers in their setup functions.

### DataStore Pattern
`src/modules/data/dataStore/DataStore.ts` provides generic async data loading with:
- `LoaderStrategy` (how to fetch data) + `StorageStrategy` (how to cache it)
- TTL-based refresh, snapshot subscriptions, progress tracking
- Used for people lists, game data, etc.

### Storage
- `TypedStorage` in `src/modules/core/storage.ts` — character-scoped localStorage wrapper
- Two instances: `globalStorage` (shared) and `characterStorage` (per-character with `{character}:{key}` prefixing)
- Schema-validated keys defined in `src/modules/core/storageSchema.ts`

### State & Settings
Settings and state are managed through `src/modules/core/` (storage, default settings, migrations). UI state for popups and timers lives directly in `src/web/` files.

### Plugin API
- `src/client/PluginApi.ts` is the stable API surface exposed to external plugins
- Types are auto-generated into `plugin-types/` via `yarn build:types`
- Plugin registries (triggers, buttons, footer, location notes) in `src/modules/core/`
- `src/client/PluginManager.ts` handles dynamic loading and lifecycle
- See `examples/` for plugin structure

### Helper App
`helper/` contains a Go application that provides native OS integration (system tray, hotkeys, window management). It communicates with the web client via WebSocket. Agents typically do not need to modify this unless working on native integration features.
