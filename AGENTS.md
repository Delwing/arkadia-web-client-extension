# AGENTS

This document provides context for AI agents working on this codebase.

## Project Overview

Arkadia Web Client Extension is a browser-based client for the Arkadia MUD (Multi-User Dungeon) game. It features:
- A React web interface for settings, displays, and UI management
- A client script system for game interaction
- A plugin editor for users to write custom scripts
- Map visualization, combat tracking, and chat history

## Tech Stack

- **Framework**: React 19 with TypeScript 5.8
- **Build Tool**: Vite 7 (multi-entry: client + editor)
- **UI**: React-Bootstrap + Bootstrap 5
- **Code Editor**: Monaco Editor with Shiki syntax highlighting
- **Backend**: Firebase
- **Special**: lua-in-js (Lua interpreter), sql.js (SQLite in WASM), esbuild-wasm
- **Testing**: Jest (unit) + Playwright (e2e)

## Directory Structure

```
src/
├── client/           # Client-side scripts for Arkadia interaction
│   ├── scripts/      # Feature-specific scripts (40+ modules)
│   ├── triggers/     # Trigger system for game events
│   ├── lua/          # Lua-related functionality
│   └── ansi/         # ANSI color/formatting handling
├── web/              # React web application
│   ├── components/   # React components
│   ├── stores/       # State management
│   ├── hooks/        # React hooks
│   └── options/      # Settings interface
├── shared/           # Code shared between client and web
├── modules/          # Modular functionality (core, firebase, device, data)
└── ui/web/           # Web UI components

editor/               # Plugin editor application (separate entry point)
examples/             # Example plugins
test/                 # Test files
data/                 # Game data (DO NOT MODIFY)
```

## Path Aliases

Use these TypeScript path aliases:
- `@client` → `src/client`
- `@web` → `src/web`
- `@shared` → `src/shared`
- `@web-ui` → `src/ui/web`
- `@modules` → `src/modules`

## Development Commands

```bash
yarn dev          # Start dev server
yarn build        # Production build
yarn test         # Run unit tests
yarn test:e2e     # Run end-to-end tests
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

- **Client**: `src/client/main.ts` - Main client functionality
- **Web UI**: `index.html` - React application root
- **Editor**: `editor/index.html` - Plugin editor interface

## Screenshots

For taking screenshots:
- Use `sandbox.html` for isolated testing
- Use the "close connection" popup button
- Logging in is not required for most screenshots

## Common Patterns

### Event System
The project uses a custom event system in `src/shared/events/`. Check existing event handlers for patterns.

### State Management
State is managed through stores in `src/web/stores/`. Follow existing store patterns when adding new state.

### Plugins
External plugins are managed by `src/client/PluginManager.ts`. See `examples/` for plugin structure.