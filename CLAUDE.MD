Use `yarn`, never `npm`.

## Codebase Orientation

When exploring this codebase for the first time:
1. Read `AGENTS.md` for project overview and patterns
2. Read `src/client/Client.ts` and `src/client/Triggers.ts` to understand the core client architecture
3. Read `src/modules/core/storage.ts` and `src/modules/core/storageSchema.ts` for the storage system
4. Check `src/shared/events/` for the event type definitions that connect modules

For plugin-related work, start with `src/client/PluginApi.ts` and `examples/`.

## Platform Notes

### Linux / CI (default)
Commands run normally with no special handling:
```bash
yarn build
yarn test
yarn test:e2e
```

### Windows Git Bash
Large command output (~80KB+) piped through `tail`/`grep` causes **false exit code 1** due to SIGPIPE issues on Windows Git Bash.

**Always use this pattern for `yarn build` and `yarn test`:**

```bash
yarn build 2>&1 > /dev/null || true
# Then run: npx tsc --noEmit
# (no output = type-check success)
```

For tests:
```bash
yarn test 2>&1 > /dev/null || true
# Then run a second pass just to read the summary:
yarn test --silent 2>&1 | tail -20
```

For e2e tests:
```bash
# Use a timeout — the process may hang on Windows after tests complete
timeout 600 yarn test:e2e 2>&1 || true
# For a single spec:
timeout 180 yarn test:e2e e2e/some-spec.spec.ts 2>&1 || true
```

Never trust the exit code from piped build/test commands on this platform.

## Base Instructions

All instructions in AGENTS.md apply.

@AGENTS.md
