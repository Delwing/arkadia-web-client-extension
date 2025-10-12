# Arkadia Web Client - Development Guidelines

## Build/Configuration Instructions

### Project Structure
This repository uses Yarn workspaces to manage the following primary packages:

- `client`: Legacy runtime that powers the classic Arkadia browser client bundle.
- `web-client`: Modern React-based interface and supporting utilities.
- `scripts`: Helper scripts for data preparation and tooling.

Additional directories such as `docs/` and `data/` provide documentation and reference assets.

### Prerequisites
- **Node.js** compatible with Yarn 1.22.22.
- **Yarn 1.22.22** (declared via the root `packageManager`).

### Build Process
1. **Install dependencies**: `yarn install`.
2. **Client build**: `yarn --cwd client build`.
3. **Web client build**: `yarn --cwd web-client build`.
4. **Development servers**: run `yarn --cwd web-client dev` for the React app or `yarn --cwd client watch` for the legacy runtime bundle.

### Workspace-Specific Commands
Use the workspace-specific scripts when iterating on a particular surface area:

```bash
# Build the client bundle
$ yarn --cwd client build

# Build the React web client
$ yarn --cwd web-client build

# Run tests for the client workspace
$ yarn --cwd client test

# Run tests for the React web client
$ yarn --cwd web-client test
```

### Client Workspace Specifics
- **Entry point**: `client/src/main.ts`.
- **Output**: `client/dist/main.js`.
- **Build tool**: Webpack with `ts-loader`.
- **TypeScript config**: Targets ES2021 with CommonJS modules.
- **Development mode**: Includes inline source maps.

### Web Client Workspace Specifics
- **Entry point**: `web-client/src/main.tsx`.
- **Build tool**: Vite with React and TypeScript support.
- **TypeScript config**: ES2022 modules.
- **Development mode**: `yarn --cwd web-client dev` starts a local development server with hot module replacement.

## Testing Information

### Test Framework
- **Jest** with TypeScript support (`ts-jest`).
- **Environment**: JSDOM for DOM testing.
- **Configuration**: Workspace-specific Jest configs.

### Running Tests
```bash
# Run all tests
$ yarn --cwd client test
$ yarn --cwd web-client test

# Run specific test file in the client workspace
$ yarn --cwd client test filename.test.ts

# Run tests in watch mode
$ yarn --cwd client test --watch
```

### Test Structure
- **Test location**: `client/test/` and `web-client/test/` directories.
- **Naming convention**: `*.test.ts` / `*.test.tsx`.
- **Test environment**: JSDOM (for DOM manipulation testing).

### Adding New Tests
1. Create a test file in the appropriate workspace directory with a `.test.ts`/`.test.tsx` extension.
2. Use Jest's `describe`/`it` or `test` helpers.
3. Example structure:

```typescript
describe('Feature Name', () => {
    test('should test specific functionality', () => {
        // Test implementation
        expect(result).toBe(expected);
    });
});
```

### Example Test Execution
The project includes comprehensive test coverage with 60+ tests across multiple suites. Most tests pass consistently, with occasional mock-related issues in specific scenarios (e.g., `attackBeep.test.ts`).

## Additional Development Information

### Code Style Guidelines

#### TypeScript Configuration
- **Target**: ES2021 for the legacy client, ES2022 for the React app.
- **Module systems**: CommonJS in `client`, ES modules in `web-client`.
- **Strict mode**: Disabled, but specific linting rules enabled:
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
  - `noFallthroughCasesInSwitch: true`
  - `noUncheckedSideEffectImports: true`

#### Naming Conventions
- **Classes**: PascalCase (e.g., `Client`, `PackageHelper`).
- **Methods/Functions**: camelCase (e.g., `addEventListener`, `sendCommand`).
- **Properties**: camelCase (e.g., `eventTarget`, `packageHelper`).
- **Files**: camelCase for TypeScript files (e.g., `attackBeep.ts`, `inlineCompassRose.ts`).

#### Architecture Patterns
- **Event-driven architecture**: Heavy use of `EventTarget` and `CustomEvent`.
- **Dependency injection**: Client class instantiates and manages helper classes.
- **Modular design**: Features separated into individual script files and React modules.
- **Service registry**: Shared browser services (settings, data catalog, etc.) are resolved at runtime without Chrome-specific APIs.

#### Regular Expressions
**CRITICAL**: Never use Polish letters in regular expressions (as specified in AGENTS.md).

#### File Organization
- **Main client code**: `client/src/`.
- **Feature scripts**: `client/src/scripts/`.
- **Type definitions**: `client/src/types/`.
- **React components and hooks**: `web-client/src/`.
- **Tests**: `client/test/` and `web-client/test/`.
- **Static data**: JSON files in `client/src/` (e.g., `blockers.json`, `people.json`).

### Development Workflow
1. Make changes in the appropriate workspace.
2. Run tests to ensure no regressions (`yarn --cwd client test` and/or `yarn --cwd web-client test`).
3. Use watch mode for development: `yarn --cwd client watch` or `yarn --cwd web-client dev`.
4. Build production artifacts with the workspace-specific build commands.

### Debugging
- **Source maps**: Available in development mode for both workspaces.
- **Console logging**: Used throughout the codebase for diagnostics.
- **Browser DevTools**: Recommended for inspecting network requests and runtime state.
- **Game integration**: Interfaces with the Arkadia MUD backend via websocket/HTTP APIs.
- **Map rendering**: Uses `mudlet-map-renderer` within both the legacy and modern clients.
