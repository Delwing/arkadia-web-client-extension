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
- **Build Tool**: Vite 7 (multi-entry: client + editor + viewer)
- **UI**: React-Bootstrap + Bootstrap 5
- **Code Editor**: Monaco Editor with Shiki syntax highlighting
- **Backend**: Firebase
- **Special**: lua-in-js (Lua interpreter), sql.js (SQLite in WASM), esbuild-wasm
- **Testing**: Jest (unit) + Playwright (e2e)

## Directory Structure

```
src/
├── client/           # Client-side scripts for Arkadia interaction
│   ├── scripts/      # Feature-specific scripts (90+ modules)
│   ├── lua/          # Lua scripts for combat coloring and magics
│   ├── ansi/         # ANSI color/formatting handling
│   ├── Triggers.ts   # Trigger system for game events
│   ├── PluginManager.ts  # External plugin management
│   ├── Client.ts     # Core client class
│   └── main.ts       # Client entry point
├── web/              # React web application
│   ├── hooks/        # React hooks (popups, drag, scroll)
│   ├── options/      # Settings interface (40+ components)
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
examples/             # Example plugins
test/                 # Jest unit tests (mirrors src/ structure)
e2e/                  # Playwright end-to-end tests (65+ specs)
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

## Testing Requirements

**Always run tests before completing a task.**

1. Run `yarn test` for unit tests
2. Run `yarn test:e2e` for end-to-end tests
3. Ensure `yarn build` completes without errors

## Coding Guidelines

### General
- Use `yarn`, never `npm`
- Prefer ESM imports (`import`/`export`)
- Follow existing code patterns in the codebase

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

There are three Vite build entries (see `vite.config.ts`):
- **Client**: `index.html` → `src/web/main.ts` - Main web application
- **Editor**: `editor/index.html` → `editor/main.ts` - Plugin editor
- **Viewer**: `viewer/index.html` → `viewer/main.tsx` - Session log viewer

The client-side scripts entry is `src/client/main.ts`.

## Common Patterns

### Event System
The project uses a custom event bus in `src/modules/core/eventBus.ts` with typed events defined in `src/shared/events/`. Check existing event handlers for patterns.

### State & Settings
Settings and state are managed through `src/modules/core/` (storage, default settings, migrations). UI state for popups and timers lives directly in `src/web/` files.

### Plugins
External plugins are managed by `src/client/PluginManager.ts`. Plugin registries for triggers, buttons, footer components, and location notes are in `src/modules/core/`. See `examples/` for plugin structure.
