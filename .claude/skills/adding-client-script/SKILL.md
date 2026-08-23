---
name: adding-client-script
description: Use this skill when adding a new feature script to src/client/scripts/ — for example porting a Mudlet/Lua script, adding a new alias, registering triggers, or any module called from src/client/main.ts registerScripts. Covers the script signature, wiring, color/AnsiAwareBuffer gotchas, where game state lives, and the test/docs steps.
---

# Adding a Client Script

A "client script" is a module under `src/client/scripts/` that registers triggers, aliases, and event listeners against the `Client`. They're the unit by which game-side features ship. Existing scripts (153+) are the canonical examples — when in doubt, read the closest neighbor.

## Anatomy of a script

Standard signature, exported as default:

```ts
import Client from "../Client";

export default function initFoo(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;

    // 1. Register triggers
    client.Triggers.registerTrigger(/^...$/, (line, matches) => {
        // ...
        return line; // or null to drop the line
    }, "foo-tag");

    // 2. Listen to GMCP / custom events
    client.on("gmcp.objects.data", (data) => { /* ... */ });

    // 3. Push aliases (use /command convention)
    list.push({
        pattern: /^\/foo(?:\s+(.*))?$/,
        callback: (matches: RegExpMatchArray) => { /* ... */ },
    });
}
```

The `aliases` parameter is optional only because some scripts don't need it. If yours adds aliases, take it as a parameter — `main.ts` passes `aliases` explicitly to scripts that need it.

## Wiring (do not skip)

Two edits in `src/client/main.ts`:

1. Add the import alongside the others at the top.
2. Add the call inside `registerScripts(client)`. Pass `aliases` if your script takes them.

If you forget step 2 the script silently never runs. The build will not warn.

## Docs

Add user-facing aliases to `docs/ALIASES.md` under the most relevant section (Druzyna, Komunikacja, Czas, etc.). One row per alias variant. Add a `> **Wskazowka:**` line for any non-obvious behavior.

If you don't add docs, treat the task as incomplete.

## Where game state lives

Reach for these instead of re-deriving state from raw GMCP:

| Need | Module | Useful methods |
|---|---|---|
| Players list (name/desc/guild/enemy/ally flags) | `@modules/data/peopleLoader` | `subscribeMerged(snap => ...)`, `refresh()`, `getMergedSnapshot()` |
| Team membership | `client.TeamManager` | `getTeamMembers()`, `getTeamMembersOnLocation()`, `isInAnyTeam()`, `isLeader()`, `getLeader()` |
| Objects on the current room (player + team + enemies) | `client.ObjectManager` | `getObjectsOnLocation()` (returns desc/hp/attack_num/category/shortcut), `hasEnemiesOnLocation()` |
| Current map / room id | `client.Map` | `currentRoom`, `tryGetMapReader()`, `getAreaName(...)` |
| Persistent settings | `@modules/core/storage` | `globalStorage` (shared) and `characterStorage` (per-char). Use `onChange(key, cb)` to react — pass the unsubscribe it returns to `client.scope.onDispose` |
| Default settings shape | `@modules/core/defaultSettings` | `defaultSettings` |

For raw GMCP, the `Client` re-emits everything as events: `client.on('gmcp.objects.data', cb)`, `'gmcp.objects.nums'`, `'gmcp.char.state'`, `'gmcp.room.info'`, etc. Note that `gmcp.objects.data` ships **partial** updates per object id — if you need a stable {desc, hp} pair, accumulate per-id locally (see `lastSeen.ts:48-65` for the pattern).

## Triggers

`client.Triggers.registerTrigger(pattern, callback, tag, options)`:

- `pattern` can be a string, `RegExp`, function, or **array** for multi-line sequence matching
- `callback` returns the (possibly modified) `AnsiAwareBuffer`, or `null` to gag the line
- Always pass a `tag` so the trigger can be cleaned up via `Triggers.removeByTag(tag)`
- `options.stayOpenLines: N` keeps a parent trigger active for N lines after matching (useful for sub-triggers)
- `registerOneTimeTrigger(...)` self-removes after first match — handy for chained command/response flows (see `ostatnio.ts` for the queryNext pattern)

**Regex must be ASCII only.** Polish letters in patterns are forbidden — write `umarl` not `umarł`, `mezczyzna` not `mężczyzna`. The game output is normalized before matching.

## Coloring text — the color-leak gotcha

This is the single most common bug when assembling colored output with `AnsiAwareBuffer`.

```ts
import { colorString, createColorFormat } from "@modules/core/Colors";
import { AnsiAwareBuffer, FormatStateSnapshot } from "@client/ansi/FormatState.ts";

const ORANGE = createColorFormat("#ffa500");
const RESET: FormatStateSnapshot = {};

const out = new AnsiAwareBuffer();
out.appendBuffer(colorString("[hp]", ORANGE));
out.append(" plain text");                 // ❌ inherits ORANGE
out.append(" plain text", RESET);          // ✅ explicitly clean
```

`AnsiAwareBuffer.append(text)` (and `insert`) **infers state from the previous segment** when no state is passed. After `appendBuffer(colorString(...))`, every subsequent plain `append` will be tinted with whatever color you just used. Always pass an explicit `{}` (or a real format) when appending plain text after colored content. The same rule applies to `insert` and `replace`.

`prefix(text)` and `suffix(text)` already default to `{}` so they're safe (FormatState.ts:523-531).

### HP bars

Match the existing style from `src/web/colors.ts` and `src/web/ObjectList.ts:697`:

- 7-cell bar `[####---]`
- `#` filled, `-` empty
- Color thresholds (after `+1` clamp to 1..7): ≤3 = `#ff6347` (tomato), ≤5 = `#ffff00` (yellow), else `#00ff7f` (springgreen)

See `lastSeen.ts:buildHpBar` for a copy-paste-friendly implementation.

### Output

- `client.print(buffer | string)` — append to output buffer without trailing newline
- `client.println(buffer | string)` — wraps with newlines on both sides
- `client.notify(text)` — OS notification
- `client.sendEvent("sound:category", "hp")` — sound effect

## Tests

Mirror the source path: `src/client/scripts/foo.ts` → `test/client/scripts/foo.test.ts`. Use Vitest with the Jest-compatible API (`jest.fn()`, `jest.mock()` both work via the `vitest.setup.ts` shim).

Use the `FakeClient extends EventEmitter` template from `test/client/scripts/hpAlert.test.ts:7-17` — it gives you a working `client.on(...)` and `client.sendEvent(...)` plus `jest.fn()` spies for `println`, `notify`, etc.

Always:
- `localStorage.clear()` in `beforeEach` and set the character via `characterStorage.setCharacter('TestChar')`
- Use `setTestSettings({ ... })` from `test/client/helpers/testSettings` instead of poking storage directly
- For triggers, the easiest way to drive them is to instantiate a real `Triggers` and feed it lines — but most existing tests just unit-test the callback logic. Pick whichever fits.

## Commands (Windows Git Bash)

Read the platform notes in `CLAUDE.md`. The short version:

```bash
yarn build 2>&1 > /dev/null || true
npx tsc --noEmit                          # silent = success

yarn test 2>&1 > /dev/null || true
yarn test --silent 2>&1 | tail -20        # second pass to read summary
```

Never trust exit codes from piped `yarn build`/`yarn test` on Windows — false 1s due to SIGPIPE.

## Checklist before declaring done

- [ ] Script file added under `src/client/scripts/` with `initX(client, aliases?)` signature
- [ ] Imported and called in `src/client/main.ts` `registerScripts`
- [ ] Triggers registered with a `tag`, regex is ASCII-only
- [ ] Plain `append`/`insert` calls after colored content pass an explicit state
- [ ] Aliases use `/command` convention and accept the substring/empty/help cases that the original (if porting) supports
- [ ] Docs row added to `docs/ALIASES.md`
- [ ] Unit test added under `test/client/scripts/` (when there's logic worth testing)
- [ ] `npx tsc --noEmit` is clean
- [ ] `yarn test --silent` passes

## When you're porting from Lua

Common substitutions:

| Lua / Mudlet | Replacement |
|---|---|
| `tempRegexTrigger`, `tempTrigger` | `client.Triggers.registerTrigger` (with a tag) |
| `tempTimer` | `setTimeout` / `setInterval` (clear them on cleanup if needed) |
| `getEpoch()` | `Date.now() / 1000` (or work in ms) |
| `cecho`, `decho`, color tags `<red>` | `colorString(text, createColorFormat("#..."))` + `client.println` |
| `gmcp.objects.nums` / `ateam.objs` | `client.on('gmcp.objects.nums', ...)` / `client.ObjectManager.getObjectsOnLocation()` |
| `ateam.team` | `client.TeamManager.getTeamMembers()` |
| `scripts.people.bind_enemies[opis]` | `peopleLoader` snapshot + check `p.isEnemy` against `name`/`description` |
| `db:like(scripts.people.db.people.short, x)` | filter `peopleLoader` snapshot by `description` (case-insensitive) |
| `scripts:print_log(s)` | `client.println(s)` |
| `package.loaded[...] = nil; require(...)` | drop entirely — no module reload needed |
