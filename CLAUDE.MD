Do not use npm, use yarn

## Build & Test Execution (Windows Git Bash)

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

Never trust the exit code from piped build/test commands on this platform.

@AGENTS.md