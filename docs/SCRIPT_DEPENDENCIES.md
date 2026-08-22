# Script Dependencies & Load Order

> Analysis of how `src/client/scripts/` modules depend on each other, where the
> ordering constraints actually live, and what has to change before scripts can be
> loaded dynamically or switched off per user.
>
> Written 2026-08-22 against `master` (10c69dc5). Counts come from a full parse of
> `src/client/scripts/**` and `src/client/main.ts`.

## Verdict

**The static import graph is not the problem.** 163 TypeScript modules in
`scripts/`, 68 script→script import edges, 46 importers, 30 imported modules,
**zero cycles**. Roughly half of those edges are pure-utility imports that should
never have been "modules" in the first place.

The blockers are three *implicit* channels that no type or import records:

1. **Registration order** — `Triggers` and `AliasList` give ordering semantic
   meaning. Position in `registerScripts()` is load-bearing.
2. **Module-level singleton state** — a dozen scripts own a module-scope object and
   expose it through a bare getter. Disabling the owner yields silently empty data,
   not an error.
3. **Partial teardown** — triggers are already ~90% tagged and removable, but
   aliases, providers, DOM listeners, intervals and module singletons have no
   per-script undo, and no script returns a disposer.

And most of what *looks* like coupling is not. Once pure code moves to a lib, the
"user data store" scripts are split from their feature half, and one write is
inverted into an event, the graph shrinks to **4 declared dependencies, 3 singletons
and 1 ordering edge** — see *What survives mitigation*. The goal is not to build a
dependency framework; it is to shrink the graph until one is unnecessary.

Everything below is organised by those channels, then by what to do about them.

---

## Channel 1 — Static imports (68 edges, acyclic)

### 1a. Pure utilities — always load, never toggle

These have no runtime state and no registration side effects. They are libraries
that happen to live in `scripts/`:

| Module | Imported by |
|---|---|
| `polishNumberConverter` | cutting, herbCounter, prettyContainers, przybywajaCount, whoCount |
| `evaluationConstants` | armorEvaluation, parryShieldEvaluation, weaponEvaluation, zlom |
| `counterTableUtils` | deliveryStats, improveCounter, kill |
| `comparisonUtils` | compareAll, compareInline |
| `BaseCounter` | improveCounter, kill |
| `printArrow` | escape, tracking |
| `otherOwner` | lamp, pipe |
| `shop` | armorShop, herbShop |
| `functionalBindCategories` | functionalBind |
| `herbTextBuilder` | herbCounter |
| `herbsLoader`, `magicsLoader`, `magicKeyLoader` | thin wrappers over `@modules/data/dataStores/*` — async, subscription-based, order-independent |
| `transports/definitions` + `ships/*.json`, `other/*.json` | mapAliases, transportTracker |
| `follow_special_exits_patterns.json`, `weapon_on/off_patterns.json`, `gags_lua.json` | data only |

**Done.** 16 modules now live in `src/client/scripts/lib/`, leaving 146 feature
scripts in `scripts/`. The dividing line is mechanical and checkable: **anything in
`scripts/` is called from `registerScripts()`; anything in `scripts/lib/` is not.**
That is the same line a toggle UI would draw, so it is worth keeping true.

The same pass fixed the rule in the other direction. Three modules were registered
in `registerScripts()` but sat loose in `src/client/` — `People`, `killTracker` and
`PackageHelper` — and moved into `scripts/`. `functionalBind` went the other way: it
is tooling that scripts *use* (and that `Client` and `KeyBindingManager` depend on),
never something to disable, so it moved to `src/client/` along with its
`functionalBindCategories` constants.

**The exception is closed too.** `allyProtection` used to be instantiated by
`Client` rather than registered, because core called into it — `Client.attackAllEnemies`
and ~12 sites in `KeyBindingManager`. It is now an ordinary registered script, and the
gate moved to the seam that already existed:

    client.registerCommandHook('allyProtection', (command, _echo, options) => { ... })

A hook returning `null` cancels the command, so one hook covers every attack path —
the attack bind, the enemy binds, aliases, plugins, and a command the player simply
types. The command shape comes from the "Komenda ataku" setting (`client.attackCommand`).
Bulk attacks pass `{suppressPrompts: true}` so an ally caught in an attack-all is
skipped quietly instead of prompting once per target.

That deleted `Client.AllyProtection`, six copies of the warn-then-confirm block
(four in `KeyBindingManager`, one each in `attackQueue` and `objectAliases`) and two
duplicate `initAllyProtection` calls — each of which had its own people
subscription, its own cache and **its own pending-attack state**, so confirming an
attack in one place did not count in another. Support is no longer gated: it sends
`wesprzyj` at the team leader and the old gate inferred the ally from the team's
current attack target rather than from the command.

No new machinery was added. A guard registry was considered and rejected — ally
protection is the only plausible consumer, and `registerCommandHook` already does
the job with better coverage.

The invariant now reads:

    registered in registerScripts(): 148
    modules directly in scripts/   : 148
    registered but NOT under scripts/: 0
    under scripts/ but NOT registered: 0

### 1b. Real feature dependencies

Where script A reads state or behaviour that script B owns. `idx` is the position in
`registerScripts()`.

| Consumer (idx) | Provider (idx) | What crosses | Break mode if provider is off |
|---|---|---|---|
| `itemCollector` (51) | `lootParser` (142) | `getBodyExtras`, `getBodyStertyMap`, `clearBodyExtras` | silently empty — collector never picks up body loot |
| `improveCounter` (41) | `kill` (40) | `getKillData()` | `killsMy/killsTeam` columns read 0 |
| `cechyHistory` (63) | `improveCounter` (41), `lvlCalc` (62) | `getLifetimeData()`, `CECHA_ORDER` | history table loses the progress column |
| `pipe` (89) | `herbCounter` (60) | `getHerbManager()` via `@modules/core/herbManagerProvider` | `null` — pipe silently does nothing |
| `lamp` (22), `smith` (58), `cutting` (54), `itemCollector` (51) | `bagManager` (53) | `getContainer`, `containerAction`, `takeFromBag` | container name resolution falls back to defaults |
| `lootParser` (142) | `zlom` (110), `prettyContainers` (52) | `getZlomFormatting`, table formatting | loot lines lose colour/notes |
| `prettyContainers` (52) | `zlom` (110), `fishing` (127), `magicKeyLoader`, `magicsLoader` | item classification | items lose grouping/colour |
| `deposits` (55) | `prettyContainers` (52), `priceEvaluation` (80) | formatting | plain output |
| `herbCounter` (60) | `wearUsed` (69), `prettyContainers` (52), `herbsLoader` | formatting | plain output |
| `idz` (39), `mapAliases` (2) | `shortcuts` (104) | `getShortcut(id)` | `undefined` — shortcut walk fails |
| `attackQueue` (20), `objectAliases` (73) | `allyProtection` | instantiated on `Client`, not in `registerScripts` | n/a today |
| `enemyBinds` (34) | `enemyBindResolvers` | resolver registry singleton | fewer bind candidates |
| `raonLabyrinthMapper` (141), `rindeLabyrinthMapper` (140) | `shortExits` (106) | exit parsing | mapper mis-parses |
| `luaGags` (117) | `combatStats` (119) | stat recording | stats not recorded |
| `afterDeathProgress` (136) | `improveCounter` (41) | `IMPROVE_STATES` const only — effectively pure | none |

**Note the inverted pairs.** `itemCollector`(51)→`lootParser`(142),
`idz`(39)/`mapAliases`(2)→`shortcuts`(104), `prettyContainers`(52)→`fishing`(127),
`luaGags`(117)→`combatStats`(119): the consumer is registered *before* the provider.
These work today only because every read happens inside a runtime callback, never at
init time. Any future refactor that moves a read into init breaks silently. A
declared-dependency model would catch this at registration.

---

## Channel 2 — Module-level singletons

The hidden half of the graph. Each of these is module-scope mutable state owned by
one script and read through a bare exported getter:

| Owner | Singleton | Readers |
|---|---|---|
| `lootParser` | `roomContents`, `bodyExtras`, `bodyStertyMap` | `itemCollector`, web `LootPopup` |
| `kill` | `getKillData()`, `getLifetimeKillData()` | `improveCounter`, web popups |
| `improveCounter` | `getImproveData()`, `getLifetimeData()` | `cechyHistory`, web popups |
| `zlom` | `getZlomFormatting(name)` | `lootParser`, `prettyContainers` |
| `shortcuts` | `shortcuts: Record<string, ShortcutEntry>` | `idz`, `mapAliases` |
| `prettyContainers` | **mutable registry** — `addGroupDefinition`, `addTransformDefinition` | `PluginApi` (plugins write into it) |
| `enemyBindResolvers` | resolver registry | `enemyBinds` |
| `bagManager` | container config from `characterStorage` | 4 scripts |
| `@modules/core/herbManagerProvider` | `registerHerbManagerProvider` ← `herbCounter` | `pipe`, web `HerbManager` |

Two of these (`prettyContainers` definitions, `herbManagerProvider`) are also part of
the **public plugin surface** — turning off the owning script would silently degrade
third-party plugins. That has to be part of the toggle contract.

The `*Loader` modules are the counter-example and the pattern to copy: they wrap a
`DataStore` and expose `subscribeToX(listener)`, so consumers get a push when data
arrives and don't care who loaded it or when.

---

## Channel 3 — Event bus (only 8 real script→script edges)

```
clock            -> sunTracker        [clock.parsedTime, clock.sunrise, clock.sunset]
clock            -> labyrinth         [clock.sunrise]
combatState      -> combatTimer       [combatState]
combatState      -> improveCounter    [combatState]
lvlCalc          -> cechyHistory      [cechy.read]
moveMode         -> zaskTimer         [moveModeChanged]
spells           -> weaponState       [weaponKnockedOff]
transportTracker -> multibinds        [transport.onBoard]
```

This channel is already fine. Listeners are late-bound, so order doesn't matter, and
a missing emitter degrades to "event never fires" — the correct failure mode. There
are ~60 further script→UI event edges (`W:` targets), which is the intended seam per
`docs/CLIENT_UI_DECOUPLING.md`.

`client.on()` already returns an unsubscribe function and accepts an `AbortSignal`
(`Client.ts:207`), so event teardown is a solved problem.

---

## Channel 4 — Shared mutable `client` state

Only four fields are written by one script and read by another:

| Field | Written by | Read by |
|---|---|---|
| `client.carriageMode` | `carriage` | `moveMode` |
| `client.moveMode` | `moveMode` | `zaskTimer` |
| `client.suppressItemEvaluation` | `selfEvaluation` | `weaponEvaluation`, `armorEvaluation`, `parryShieldEvaluation` |
| `client.herbManager` | `herbCounter` | (type surface only) |

Small enough to convert to events or providers in an afternoon. The remaining
`client.*` surface used by scripts is read-only API: `Triggers`(106 users),
`on`(52), `sendCommand`(46), `println`(42), `sendEvent`(39), `Map`(30), `print`(26),
`FunctionalBind`(22), `TeamManager`(20), `aliases`(15).

---

## Channel 5 — Registration order (the actual blocker)

### Mechanics

- `Triggers.triggers` is a `Map`; `parseLine` iterates it in **insertion order**,
  which is exactly the order of `init*` calls in `registerScripts()`
  (`Triggers.ts:268`).
- Each trigger receives the buffer the previous one returned. The output pipeline is
  an **ordered fold**, not a set of independent handlers.
- `return null` or `buffer.markAsDeleted()` **aborts the rest of the chain** for that
  line. Downstream scripts never see it.
- Token triggers always run *after* all regular triggers. Multiline triggers are a
  separate chain (`parseMultiline`).
- `AliasList.forCommand()` returns a bucket that `CommandProcessor` scans linearly
  and returns on **first match** (`CommandProcessor.ts:66`). Registration order =
  precedence.
- Command hooks are the one subsystem with an **explicit priority**
  (`registerCommandHook(id, cb, priority)`, sorted descending). 5 users:
  `introduced`, `labyrinth`, `lootParser`, `raonLabyrinthMapper`,
  `rindeLabyrinthMapper`. This is the model to generalise.

### What is *not* order-dependent (important)

`parseLine` computes `plain` **once from the original line text** and threads it to
every trigger, including children (`Triggers.ts:255-259`). So **pattern matching is
order-independent** — a script that rewrites the buffer does not change what
downstream scripts match on. Only side effects, formatting and suppression are
ordered. That removes the scariest failure class up front.

### The constraints that are real

1. **Suppression before consumption.** Exactly **12 scripts** suppress lines —
   33 `return null` inside a trigger callback plus 7 `markAsDeleted()`:

   | Script | idx | `return null` | `markAsDeleted` | Intent |
   |---|---|---|---|---|
   | `poczta` | 129 | 16 | | consumes mail listing, re-renders it in a popup |
   | `armorEvaluation` | 112 | 4 | | replaces the raw evaluation line |
   | `weaponEvaluation` | 111 | 4 | | replaces the raw evaluation line |
   | `parryShieldEvaluation` | 113 | 3 | | replaces the raw evaluation line |
   | `selfEvaluation` | 82 | 2 | 2 | replaces the raw evaluation line |
   | `compareAll` | 64 | 1 | 1 | consumes comparison block |
   | `luaGags` | 117 | | 2 | true gag — hide combat spam |
   | `gags` | 116 | | 1 | true gag — hide combat spam |
   | `combatWindow` | 118 | | 1 | routes combat to its own window |
   | `prettyContainers` | 52 | 1 | | consumes container listing |
   | `ostatnio` | 144 | 1 | | consumes report block |
   | `wyroznienieOptions` | 125 | 1 | | consumes options block |

   (Other scripts contain `return null` in helper functions — `attackQueue` 5,
   `knowledge` 13 — those are not gags.)

   `gags`(116) and `luaGags`(117) sit late, so the 116 scripts before them still see
   combat lines. The 34 after — `combatWindow`, `combatStats`, `clock`, `fishing`,
   `poczta`, `lootParser`, `messageFlair`, `lastSeen`, `dobOp` — do not. Moving the
   gags earlier breaks counters; moving counters later breaks them too. Nothing in
   the code states this; it is position-only. See *Should suppression stop
   dispatch?* below.

2. **Buffer replacement discards side-band metadata.** 44 scripts construct a new
   `AnsiAwareBuffer`. `flair` only survives an explicit clone
   (`FormatState.ts:455`). This is precisely why `main.ts` carries the comment that
   `initLootParser` must precede `initMessageFlair`. It is the only such constraint
   written down; the others are folklore.

3. **Layered decoration.** `coinColors`(85), `weaponColors`(86), `zlom`(110),
   `wyroznienieOptions`(125), `messageFlair`(143) all decorate the same buffers.
   Later wins on overlapping ranges.

4. **Plugins load mid-list.** `initExternalScripts` is at idx 107, so plugin
   triggers run *before* ~44 built-in scripts and *after* the rest. Undocumented,
   and it means plugin behaviour depends on which built-in it collides with.

5. **Alias shadowing.** ~200 alias patterns are pushed into one flat first-match
   list — `objectAliases` alone pushes 27, `herbCounter` 15, `improveCounter` 14,
   `bagManager` 8, `idz` 8, `shortcuts` 7, `kill` 7. A broad pattern registered early
   silently shadows a later, more specific one. There is no collision detection.

### Should suppression stop dispatch?

Half of this is already the case. `parseLine` computes `plain` **once from the
original text** (`Triggers.ts:260-261`) and threads it to every trigger and every
child (`:273`, `:143`), so **every trigger already matches against the original,
unmodified line**. Rewrites are invisible to matching.

The exception is deletion. `parseLine` bails the moment a trigger returns `null` or
the buffer is marked deleted (`:275`, `:280`), so downstream **callbacks never fire**
— even though they would have matched. `Trigger.execute` does the same to its own
children (`:135`), and `parseMultiline` returning `null` drops the entire packet
before `parseLine` even runs (`Client.ts:291-295`).

So the system conflates two separate decisions:

| Decision | Belongs to | Currently |
|---|---|---|
| **What does the line look like?** | the buffer — ordered fold, order matters by design | `return buffer` |
| **Is the line rendered?** | a flag on the buffer | `markAsDeleted()` — correct |
| **Who gets notified?** | should be everyone, unconditionally | conflated with the above |

Neither `gags` ("hide combat spam") nor `poczta` ("I re-render this block myself")
is making a statement about who else should be notified. They are display decisions
implemented as dispatch decisions.

**Proposed fix.** Make dispatch unconditional and let `deleted` be purely a render
flag:

```ts
// Triggers.parseLine — no early return
for (const trigger of this.triggers.values()) {
    line = trigger.execute(line, type, originalText, plain) ?? line
}
// ... token triggers ...
return line.deleted ? null : line
```

`return null` from a callback becomes sugar for `line.markAsDeleted(); return line`.
The mechanical migration is 33 sites across 12 files, and `markAsDeleted` already
exists and already means exactly "don't render".

**`deleted` must not mean "stop formatting".** `combatWindow` is the case that
settles this: it is a **tee**, not a gag. It clones the buffer into its own history
(`combatWindow.ts:47`) and *then* calls `markAsDeleted()` to keep the line out of the
main window. `CombatPopup` renders that clone with `entry.buffer.toHtml()`
(`CombatPopup.tsx:151`), and `logFileSaver` / `sessionLogger` consume the same entry.
So the combat window needs the line **fully prefixed and coloured exactly as the main
window would have shown it** — deletion is about *which window*, not about whether
the line gets formatted.

But a gag is different from a redirect. Gag mode 1 ("usuwaj linie") means *don't show
this anywhere* — the combat window included. Today ordering happens to produce that:
`gags`(116) deletes, `parseLine` aborts, `combatWindow`(118) never runs. Under
unconditional dispatch the same outcome has to be stated rather than fall out of
positions, and one rule is enough:

> **A tee skips a line that is already deleted.**

That is all the distinction needs. There is no second flag:

Expressed as one trigger option, `{ skipDeleted: true }` — **`combatWindow` is its
only user today**:

| Gag mode | When the gag runs | At `combatWindow` | Result |
|---|---|---|---|
| 2 — prefix | prepends `[3/6]`, not deleted | clones the prefixed buffer, marks deleted | main window drops it, combat window shows it prefixed and coloured ✔ |
| 1 — delete | marks deleted | **skipped** — `skipDeleted` | shown nowhere ✔ |

Everything else keeps running on a deleted line, because a gagged hit is still a hit
and state must not depend on visibility. That is the whole rule — no taxonomy, one
boolean.

`skipDeleted` does not, on its own, remove the ordering requirement — `combatWindow`
must still run **after** the gags, or the line is teed before anything deletes it and
mode 1 leaks into the combat window. But that is now *one named edge* rather than a
property of the whole list: see *Ordering without phases* below.

**What it actually cost.** Two regressions surfaced, both from the same root: with
the early return gone, a line now reaches triggers that never used to see it.

1. **A trigger registered mid-dispatch fired on the line that registered it.**
   `ostatnio` asks each team member in turn, registering the next one-time trigger
   from inside the previous one's callback. `this.triggers` is a `Map`, and JS Map
   iteration visits entries added during iteration — so the new trigger consumed the
   same reply and the whole queue collapsed into one answer. Fixed by snapshotting
   the trigger list at the top of `parseLine`: a trigger registered while a line is
   being dispatched must not also fire on that line. The early return had been hiding
   this for every script, not just `ostatnio`.

2. **A catch-all re-consumed a line a specific trigger had already claimed.**
   `poczta` ends with a `/^/` trigger that sweeps the rest of a letter into its body.
   Once `Data: …` stopped aborting dispatch, the header line landed in the body text.
   Fixed with `{skipDeleted: true}` — which turns out to be the general shape for
   catch-all fallbacks, not a one-off for `combatWindow`.

So `skipDeleted` has two distinct uses, and they are the same idea: **a trigger that
claims or routes a line, rather than reacting to it, should not see a line that has
already been claimed.**

Everything else came through untouched: the four unchanged ally-protection e2e tests,
the gag-rendering suite (including "a gagged hit reaches neither window"), and 55
counter/combat-adjacent e2e tests.

### Mutating a line that someone else already changed

Once dispatch is unconditional, every mutating trigger has to cope with a buffer
that no longer looks like the line it matched on: the word it wants to colour may be
gone, moved, or the line may be flagged deleted. **The codebase is already built this
way** — the check is the dominant idiom, not a new burden.

What already holds:

- **Matching is on the original line** — `plain` is computed once from `originalText`
  (`Triggers.ts:260-261`). A rewrite upstream never changes what you match.
- **The string-based colour helpers re-find the text in the *live* buffer and no-op
  when it is gone** — `colorStringInLine` does `buffer.text.indexOf(string)` and
  `if (matchIndex === -1) return buffer` (`Colors.ts:44-47`); `colorTokenInLine` the
  same (`:59-62`). That is exactly the "check the word is still there" behaviour.
- **Whole-line colouring is safe by construction** — 42 of the 63 `.color([…])` call
  sites are `[0, x.length]`, and `length` is computed from the live segments
  (`FormatState.ts:466-468`).
- **Offset-based sites mostly re-derive from the live buffer** — `personDescription`
  is the model to copy:

  ```ts
  const jestIndex = line.text.indexOf(jestWord + " ");
  if (jestIndex === -1) return line;          // gone — leave the buffer alone
  line.color([jestIndex + jestWord.length + 1, …], descriptionFormat);
  ```

  `animalTaming:50`, `durability:44`, `itemCondition:47`, `wearUsed:53`,
  `herbShop:74`, `spells:73/114` all follow it.

**The trap is `matches`.** A callback receives `matches` computed against the
*original* text but `line` as the *current* buffer. Nothing makes the two agree, so
any use of `matches.index` — or of offsets derived from `matches[n].length` — against
`line` is already latently wrong today. Only three sites do it:

| Site | Problem | Fix |
|---|---|---|
| `knowledge.ts:1033`, `:1146` | prefers `matches.index`, falls back to `line.text.indexOf` | invert the preference — the live lookup first |
| `wyroznienieOptions.ts:33-35` | derives `titleStart` from `matches[1].length + matches[2].length` and applies it to `line` | `line.text.indexOf(currentTitle)` with a `-1` guard |

`luaGags:425` is fine — its `selection` comes from the `selectString` shim and is
guarded by `selection[0] > -1`.

**What to add so new code cannot get this wrong:**

1. Make `deleted` readable in callbacks so a decorator can cheap-out first:
   `if (line.deleted) return line`.
2. Add `line.find(text, from?): [number, number] | null` — a live lookup — so offset
   maths has to pass through it rather than through `matches.index`.
3. Type or document `matches` as original-line-relative. Better: hand callbacks a
   lazily re-matched `liveMatches` when they need positions in the current buffer.

Keep the strict half of the model as it is: always matching the *original* line is
more predictable than re-matching a rewritten one, and it is what makes trigger
order irrelevant to matching.

### Scale

- **151** `init*` calls, of which 145 are `scripts/` modules.
- **335** trigger registrations; ~200 alias pushes.
- **49** scripts read `characterStorage.get('settings')` and gate behaviour on a
  flag inside their callbacks. That is today's "turn it off": the triggers stay
  registered and keep matching, and the flag cannot change the fold order.

---

## Blockers for dynamic loading / user toggles

Better than expected. **303 of 335 trigger registrations already pass a per-script
tag** (`const tag = 'lootParser'` and friends), so `Triggers.removeByTag(id)` works
today for 93 of the ~145 registered scripts. The remaining gaps:

| Registration kind | Teardown available? | State of built-ins |
|---|---|---|
| Triggers | `removeByTag(tag)` ✔ | 93 scripts fully tagged; 12 fully untagged — `clock`, `deliveryStats`, `deposits`, `gags`, `herbCounter`, `kill`, `localizers`, `luaGags`, `magic-support`, `priceEvaluation`, `specialLocations`, `userTriggers`; `move` is mixed. Tag names are ad hoc (`follow` for `move`, `bag-config` for `bagManager`, `labyrinth-mapper` for `rindeLabyrinthMapper`) — not derivable from the module name |
| Event listeners | `client.on` returns an unsubscribe fn and accepts `AbortSignal` (`Client.ts:207`) ✔ | 52 scripts subscribe; none keep the handle |
| Command hooks | `unregisterCommandHook(id)` ✔ | 5 users, ids exist, never unregistered |
| Functional binds | runtime "last set wins" per category ✔ | already contention-safe — the model to copy |
| Aliases | `AliasList.splice` ✔ (PluginApi does index+splice at `PluginApi.ts:2645`) | ✘ no owner index — nothing records which script pushed which pattern |
| Providers (`register*Provider`) | ✘ no unregister | 5 providers |
| `prettyContainers` group/transform registry | ✘ no removal | plugin-writable, shared |
| Module singletons | ✘ no reset | 9 owners (see Channel 2) |
| `setInterval` | ✘ | `clock`, `combatTimer`, `coverTimer`, `lamp`, `orderTimer`, `transportTracker`, `worldDestructionTimer`, `zaskTimer` |
| `window`/`document` listeners | ✘ | `bagManager`, `chatHistory`, `deposits`, `directionBinds`, `enemyBinds`, `externalScripts`, `functionalBind`, `improveCounter`, `kill`, `moveMode`, `multibinds` |

`PluginApi` already tracks and unwinds all of this for external plugins. Built-in
scripts simply bypass that seam and talk to `client` directly. The work is to route
them through the same tracking, not to build it.

---

## What survives mitigation

Most of the graph is not a dependency problem — it is pure code and persistent user
config that happen to live in feature scripts. Three moves dissolve it; only what is
left has to be declared.

**Move A — extract pure code to `scripts/lib/`.** No state, no registration, always
loaded, never toggleable.

| Pulled | From | By |
|---|---|---|
| `parseExitString` | `shortExits` | raon/rinde labyrinth mappers |
| `matchFishHint` | `fishing` | `prettyContainers` |
| `CECHA_ORDER`, `CechaKey`, `CechySnapshot` | `lvlCalc` | `cechyHistory` |
| `IMPROVE_STATES` | `improveCounter` | `afterDeathProgress` |
| `splitCurrency`, `convertCurrency`, `processItemValue` | `priceEvaluation` | `deposits`, `stoneValue` |
| `colorForWear`, `getWearValue`, `processWearUsed` | `wearUsed` | `herbCounter`, `selfEvaluation` |
| `parseContainer`, `categorizeItems`, `formatTable`, `prettyPrintContainer` | `prettyContainers` | deposits, herbCounter, lootParser, magicKeys, magics |
| the ~15 already-pure modules from Channel 1a | — | — |

**Move B — split the "user data store" scripts.** Several scripts mix *persistent
user config* (getters and mutators over storage, also read by the web UI and by
plugins) with a *toggleable feature* (aliases, triggers, tables). The config half
belongs in an always-on core module, next to `@modules/data/dataStores/*`; only the
feature half becomes toggleable. This is the highest-leverage move — it also empties
most of Channel 2.

| Script | Config half → core | Feature half stays a script |
|---|---|---|
| `bagManager` | `getContainer`, `getContainerForms`, `containerAction`, `takeFromBag` | `/worek` aliases, config UI triggers |
| `zlom` | `getZlomFormatting`, `mergeZlomData`, `setZlomColor/Note` | the `/zlom` report and triggers |
| `shortcuts` | `getShortcut` | `/skroty` aliases and table |
| `prettyContainers` | the group/transform registry (plugin-writable) | the container triggers |
| `herbCounter` | the herb manager provider | counter, tables, aliases |
| `enemyBindResolvers` | already a standalone registry | — |

**Move C — invert a write into an event.** `luaGags`(117) imports
`recordCombatStat` from `combatStats`(119) and calls it. Emit instead, and
`combatStats` subscribes: the edge disappears from the import graph and
`luaGags` stops caring whether the stats window exists.

### The residue

| Was | After mitigation |
|---|---|
| 68 script→script import edges | **4 declared dependencies** |
| 9 module singletons | **3** — `lootParser` room contents, `kill`, `improveCounter` |
| 4 shared `client` fields | **1** — `suppressItemEvaluation`; `moveMode`/`carriageMode` belong on the existing `MovementManager`, `herbManager` is type surface only |
| 8 script→script event edges | **9**, and they were never a problem |
| 151-position implicit ordering | **1 edge** — `combatWindow` after the gags |

The four that survive, because they are genuine "this feature reads state that
feature owns":

| Consumer | Provider | Kind | Degraded behaviour |
|---|---|---|---|
| `itemCollector` | `lootParser` | `requires` | cannot pick up body loot at all |
| `improveCounter` | `kill` | `optional` | kill columns read 0 |
| `cechyHistory` | `improveCounter` | `optional` | history loses the progress column |
| `pipe` | `herbCounter` | `optional` | already provider-mediated; returns `null` |

Four declarations is small enough to hand-write and keep honest. That is the whole
point of the exercise: not to build a dependency framework, but to shrink the graph
until a framework is unnecessary.

---

## Proposed target design

### 1. A per-script scope instead of raw `client` — **landed**

A per-script facade that records every registration and can undo them all, modelled
on `PluginApi`'s cleanup tracking. It shipped as `ScriptScope` + `ScriptRegistry`
(`src/client/`), with two departures from the sketch below.

**Scripts still take a plain `Client`.** Rather than a new first parameter on all
148 init functions — and on the ~240 unit tests that call them — `registerScripts`
hands each script a *scoped view* of the client: a `Proxy` whose `Triggers` and
`aliases` stamp an owner, whose `on` carries the scope's `AbortSignal`, and which
exposes `client.scope` for everything else. Nothing else changes, so a script
handed a bare client in a test behaves exactly as it does in the app.

The attribution deliberately rides on the object the script closed over rather than
on a "currently loading script" global. That is what makes it cover the triggers a
script registers *later*, from inside a callback — a follow-up one-time trigger, a
re-registration on a settings change — which is most of the hard cases.

**Owner is a separate field from `tag`, not a normalisation of it.** The original
plan was to rewrite the 93 ad-hoc tags to the script id. That would have broken the
34 `removeByTag` call sites where a script uses a tag to clear *part* of itself: if
tag == id, clearing the part clears the whole script. So `owner` is assigned by the
scope and `tag` stays the script's own; `removeByOwner` and `removeByTag` are
independent sweeps.

```ts
export interface ScriptScope {
  readonly id: string                // module name under scripts/
  readonly signal: AbortSignal
  interval(fn, ms)                   // cleared on dispose
  timeout(fn, ms)
  listen(target, type, handler)      // removed on dispose
  onDispose(fn): void
  dispose(): void
}
```

`ScriptRegistry.start(id, init)` runs one script in a fresh scope; `stop(id)` undoes
it. The invariant that the set of ids equals the set of modules in `scripts/` is
asserted in `test/client/ScriptRegistry.test.ts`, which is where the 148/148 count
now lives.

Stage 1b then closed the routes around it. Anything a script registers outside the
scope outlives the script, so the three that existed were redirected:

| Was | Now | Sites |
|---|---|---|
| `window.setInterval` | `client.scope.interval` | 9 |
| `window.addEventListener` | `client.scope.listen` | 11 |
| `eventBus.on` | `client.on` (carries the scope's signal) | 15 |

`test/client/ScriptRegistry.test.ts` asserts no script under `scripts/` reaches for
`window` or `document` directly, and checks two real scripts — `lamp` stops counting
down and `moveMode` stops answering the keyboard once stopped.

What the scope still does **not** reclaim: the 9 module-level singletons (stage 4)
and `herbCounter`'s provider registration, which has no unregister yet.

### 2. Manifest per script

```ts
export const manifest = {
  id: 'lootParser',
  title: 'Parser lupu',
  requires: ['zlom'],              // hard — cannot enable without
  optional: ['prettyContainers'],  // soft — degrades
  provides: ['roomContents'],
} as const

export default function init(ctx: ScriptContext): void { ... }
```

Three fields, all about *dependencies* — nothing about ordering. See below for why
that is enough.

### 3. Ordering without phases

Keep the flat list in `registerScripts` as the order. No buckets, no taxonomy. Once
suppression stops aborting dispatch, position stops carrying meaning for almost
everything:

- **Matching** is already on the original line, so a rewrite upstream can never
  change what a later script matches.
- **State and counters** no longer depend on who deleted what, because everything is
  dispatched.
- **Decoration** order still decides who wins on an overlapping range — but that is
  cosmetic, not correctness.

What is left is a handful of genuine "must run after" edges. Declare those, and only
those, on the manifest — reusing the dependency idea rather than inventing a second
concept:

```ts
export const manifest = {
  id: 'combatWindow',
  after: ['gags', 'luaGags'],   // tee the finished line, not a half-decorated one
}
```

The registry stable-sorts so declared edges hold and everything else keeps its written
position. Today that is **two edges in the whole codebase**:

| Edge | Why | Alternative |
|---|---|---|
| `combatWindow` after `gags`, `luaGags` | it tees the finished buffer, and `skipDeleted` only works if the gags have already run | none — keep the edge |
| `messageFlair` after `lootParser` | `lootParser` returns a freshly built buffer, which drops the `flair` marker | **delete the edge** — see below |

That second row is the pattern worth generalising. An ordering constraint that exists
because side-band metadata does not survive buffer replacement is a bug in the buffer
API, not a scheduling problem. 44 scripts construct a fresh `AnsiAwareBuffer`, and
`clone()` already carries `flair` (`FormatState.ts:455`) — so adding a
`line.replaceWith(next)` that carries `flair`/`deleted` across makes the constraint
stop existing, instead of being scheduled around. Prefer that to any ordering
mechanism, every time.

### 3b. What is enforced

No phases means no phase enforcement. What the registry does enforce:

| Rule | How |
|---|---|
| Declared `after` edges hold | stable topological sort at registration; throw on a cycle |
| Dependencies exist | `requires` checked at registration; throw on a missing id |
| Disabling cascades | a script whose `requires` is disabled is disabled too; `optional` just degrades |
| Teardown is total | the scope records every trigger, alias, event listener, command hook, interval and DOM handler — **partly landed**, see stage 1b |
| A script is registered exactly once, and only scripts are | `test/client/ScriptRegistry.test.ts` compares the ids in `registerScripts` against the modules in `scripts/`, both directions |
| `skipDeleted` triggers never see a suppressed line | `parseLine` does not dispatch them when `line.deleted` |

What stays convention, said plainly: nothing stops a script from mutating a buffer it
should only be observing, from calling `sendCommand` inside a counter, or from
colouring a range it does not own. Enforcing that needs the phase split with
per-phase callback signatures — which is exactly the complexity being declined here.
The trade is deliberate: a smaller model, and misuse caught by review rather than by
the compiler.

### 4. Typed absence instead of silent empty

Replace the singleton getters with services resolved through the registry, so a
disabled provider is a `null` the consumer must handle, checked at registration time
against `requires`/`optional` — not an empty object discovered at runtime.

---

## Test coverage

The plan leans on the test suite to make stage 0b safe. It does not hold up as well as
assumed.

**Method, and its limits.** Coverage is measured by whether *any* test file imports
`@client/scripts/<name>` — matching on test *filenames* undercounts badly, because
several scripts are covered from differently-named files (`compareAll` from
`comparison.test.ts`, `deposits` from `deposit.test.ts`, `combatState` from
`combatTimer.test.ts`, `lvlCalc` from `cechyHistory.test.ts`, `fakeLine` from
`fakeAlias.test.ts`). E2E specs are named after *features and UI*, not scripts
(`containers`, `herbs`, `loot-popup`, `fight-title`), so they cannot be attributed to
a script automatically — instead, every spec was checked for whether it pushes game
text through the trigger pipeline at all (`pushText`), which is what a
dispatch-order change would actually break.

| | Count |
|---|---|
| Registered scripts | 144 |
| ...imported by at least one unit test | **144 (100%)** |
| ...not imported by any unit test | **0** |
| E2E specs total | 111 |
| ...that push game text through the trigger pipeline | **43 (39%)** |
| ...the other 68 | layout, settings, keybinds, mobile, Firebase — blind to trigger order |

Every registered script now has unit coverage. E2E remains feature-shaped —
`e2e/scripts.spec.ts` is about the *plugin* modal, not the built-in scripts — so the
unit layer is what pins per-script behaviour.

**The gaps sit exactly where stage 0b is riskiest.** Of the 12 scripts that suppress
lines — the ones whose behaviour changes when `parseLine` stops aborting — only 4
have a unit test:

| Script | Unit test | Mentioned in e2e |
|---|---|---|
| `armorEvaluation` | ✔ | |
| `weaponEvaluation` | ✔ | |
| `parryShieldEvaluation` | ✔ | |
| `prettyContainers` | ✔ | |
| `gags` | **✔ added** | 2 specs |
| `luaGags` | **✔ added** | 1 spec (`lua-gags-settings`) |
| `combatWindow` | **✔ added** | — |
| `poczta` | ✘ | 4 specs |
| `ostatnio` | ✘ | 1 spec |
| `compareAll` | ✘ | — |
| `selfEvaluation` | ✘ | — |
| `wyroznienieOptions` | ✘ | — |

`combatWindow` and `combatStats` were the two scripts flagged as the first
double-handling suspects for stage 0b, and neither had a test of any kind.
**Both now do** — see *Pre-work landed* below.

### Coverage landed — every registered script

**144/144 registered scripts now have unit coverage**, up from 86. The suite went from
178 files / 1825 tests to **241 files / 2529 tests**, all green, `tsc --noEmit` clean.

The 12 line-suppressing scripts came first, because they are the ones whose behaviour
depends on trigger registration order. Two contracts that previously existed only as
positions in `registerScripts` are now executable:

- gag mode 2 -> the combat window shows the line **prefixed and coloured, exactly as
  the main window would have**;
- gag mode 1 -> the line appears **nowhere**, combat window included.

And the invariant stage 0b must not break, from `luaGags`: *stats are recorded even
when the line is deleted* — a gagged dodge is still a dodge.

**Behaviours pinned deliberately rather than fixed.** Writing the tests surfaced
several quirks; each is covered by a test that documents current behaviour, so a
future change to it is a decision rather than an accident:

| Script | Behaviour |
|---|---|
| `wyroznienieOptions` | the first non-indented line after an option block is **swallowed**, not just used as a terminator (`wyroznienieOptions.ts:88-91`) |
| `move` | a single-word name after "Podazasz za" resolves nothing — the candidate loop starts at 1 and indexes from the end |
| `languageSkills` | only the level column is padded, so gauges align between rows with equal-length names, not across all rows |
| `gags`/`luaGags` | delete mode returns before prefixing, so a suppressed line carries no `[n/6]` marker |
| `dobOp` | the slot-argument aliases fire and forget rather than returning their promise |

**What the tests confirmed about teardown.** Several scripts leak per-init
registrations that survive between tests, which is exactly the work item this document
describes:

- `directionBinds`, `enemyBinds`, `multibinds` each add a `window` keydown listener
  per init and never remove it;
- `chatHistory`, `sunTracker`, `letter`, `knowledge`, `weaponState` subscribe to the
  global bus without unsubscribing;
- `labyrinth`, `rindeLabyrinthMapper`, `raonLabyrinthMapper`, `lootParser`,
  `combatWindow`, `combatStats`, `shortcuts`, `chatHistory` keep module-level state
  that no reset clears.

Where that made an assertion unreliable, the test asserts through the client's own
output instead of the shared bus, and says so in a comment. Those comments are a map
of what `ScriptContext` has to take ownership of.

**Stage 0b is gated.** Every script that suppresses a line, and every script that
could start seeing suppressed lines, now has tests that will catch the change.

---

## Migration plan

| Stage | Work | Behaviour change | Risk |
|---|---|---|---|
| ~~**0**~~ | ~~Move the pure utilities into `scripts/lib/`~~ — **done**: 16 modules moved, 47 files re-imported, no behaviour change | none | none |
| ~~**0b**~~ | ~~Decouple suppression from dispatch~~ — **done**: `parseLine` folds through every trigger and decides at the end; `return null` is sugar for `markAsDeleted()`; `{skipDeleted: true}` opts a trigger out | **yes** | landed |
| ~~**1**~~ | ~~Introduce `ScriptContext`~~ — **done**, as `ScriptScope` + `ScriptRegistry`. Scripts still take a plain `Client`; `registerScripts` hands each one a scoped *view* of the client that stamps an `owner` on its triggers and aliases. `Triggers.removeByOwner` / `AliasList.removeByOwner` sweep them; `client.on` and `registerCommandHook` are tracked too | none | landed |
| ~~**1b**~~ | ~~Finish teardown~~ — **done**: the 9 `setInterval` and 11 `window.addEventListener` sites now go through `client.scope`, and the 15 direct `eventBus.on` calls through `client.on`, so they carry the scope's `AbortSignal`. A test asserts no script reaches for `window`/`document` directly | none | landed |
| **2** | Add `manifest` + registry; keep `registerScripts`'s written order, honour the two `after` edges via a stable topo-sort; **assert the result equals today's order** and land it as a provable no-op | none | low |
| **3** | Replace the 4 shared `client` fields and formalise the 8 event edges as declared `provides`/`requires` | none | low |
| **4** | Convert the 9 module singletons to registry-resolved services | none | medium — touches `kill`, `improveCounter`, `lootParser`, `zlom` |
| **5** | Add `line.replaceWith(next)` carrying `flair`/`deleted` across a buffer replacement; drop the `messageFlair` after `lootParser` edge | none | low |
| **6** | Dynamic enable/disable UI; hard-required deps disable together, optional deps degrade | yes | medium |
| **7** | Lazy `import()` per script, keyed on the manifest | yes | low once 1–6 land |

Only stage 0b changes behaviour before the toggle UI arrives; everything up to stage 5
is a no-op that can land incrementally on master. 0b is the one that needs a full e2e
run and a close look at `combatStats`.

### Where extraction will be expensive

Leave these for last — they are the god files that also happen to own singletons:
`knowledge` (2 748 lines), `raonLabyrinthMapper` (1 172), `kill` (922),
`transportTracker` (883), `oswajanie` (868), `clock` (837), `herbCounter` (832),
`prettyContainers` (817), `spells` (717), `zlom` (678). See
`docs/architecture-analysis.md` for the overlapping split proposals.

---

## Appendix — registration order

Generated from `src/client/main.ts` (`registerScripts`) and a TypeScript-AST parse of
each module. `#` is the position in the trigger/alias fold. `tagged` is how many of a
script's trigger registrations pass a tag argument, i.e. how much of it
`Triggers.removeByTag` can already undo.

| # | script | triggers | tagged | aliases | suppresses | hook | bind | interval | DOM | lines |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | `fakeLine` |  |  |  |  |  |  |  |  | 10 |
| 1 | `soundAliases` |  |  | 3 |  |  |  |  |  | 26 |
| 2 | `mapAliases` |  |  | 1 |  |  |  |  |  | 499 |
| 3 | `zaznaczaj` |  |  | 2 |  |  |  |  |  | 53 |
| 4 | `(registerRoomInfoProvider)` | — | — | — | — | — | — | — | — | — |
| 5 | `(registerCurrentRoomProvider)` | — | — | — | — | — | — | — | — | — |
| 6 | `(registerMapDestinationsProvider)` | — | — | — | — | — | — | — | — | — |
| 7 | `(registerTeamStateProvider)` | — | — | — | — | — | — | — | — | — |
| 8 | `teamBlockers` | 2 | 2/2 |  |  |  |  |  |  | 43 |
| 9 | `move` | 8 | 7/8 |  |  |  |  |  |  | 87 |
| 10 | `directionBypass` |  |  | 1 |  |  |  |  |  | 21 |
| 11 | `noExitHighlight` | 1 | 1/1 |  |  |  |  |  |  | 17 |
| 12 | `mapCorrections` | 1 | 1/1 |  |  |  |  |  |  | 96 |
| 13 | `tideWarningHighlight` | 1 | 1/1 |  |  |  |  |  |  | 24 |
| 14 | `transportTracker` | 12 | 12/12 | 2 |  |  | yes | yes |  | 883 |
| 15 | `gates` | 1 | 1/1 |  |  |  | yes |  |  | 26 |
| 16 | `seat` | 2 | 2/2 |  |  |  | yes |  |  | 39 |
| 17 | `attackBeep` | 2 | 2/2 |  |  |  |  |  |  | 106 |
| 18 | `warningTriggers` | 1 | 1/1 |  |  |  |  |  |  | 18 |
| 19 | `lostTeamMates` | 3 | 3/3 |  |  |  |  |  |  | 128 |
| 20 | `attackQueue` |  |  |  | **yes** |  |  |  |  | 125 |
| 21 | `attackModeAlias` |  |  | 1 |  |  |  |  |  | 33 |
| 22 | `lamp` | 5 | 5/5 | 2 |  |  | yes | yes |  | 125 |
| 23 | `coverTimer` | 1 | 1/1 |  |  |  |  | yes |  | 62 |
| 24 | `orderTimer` | 1 | 1/1 |  |  |  |  | yes |  | 53 |
| 25 | `combatState` |  |  |  |  |  |  |  |  | 42 |
| 26 | `combatTimer` |  |  |  |  |  |  | yes |  | 88 |
| 27 | `weaponState` | 4 | 4/4 |  |  |  |  |  |  | 98 |
| 28 | `zaskTimer` |  |  |  |  |  |  | yes |  | 69 |
| 29 | `worldDestructionTimer` | 1 | 1/1 |  |  |  |  | yes |  | 57 |
| 30 | `binds` |  |  | 1 |  |  | yes |  |  | 42 |
| 31 | `tempBinds` |  |  | 1 |  |  | yes |  |  | 22 |
| 32 | `walkCommands` |  |  | 4 |  |  |  |  |  | 42 |
| 33 | `directionBinds` |  |  |  |  |  |  |  | yes | 113 |
| 34 | `enemyBinds` |  |  |  |  |  |  |  | yes | 367 |
| 35 | `chatHistory` |  |  | 3 |  |  |  |  | yes | 181 |
| 36 | `moveMode` | 2 | 2/2 |  |  |  |  |  | yes | 148 |
| 37 | `carriage` | 4 | 4/4 |  |  |  |  |  |  | 37 |
| 38 | `pausers` |  |  |  |  |  |  |  |  | 47 |
| 39 | `idz` |  |  | 8 |  |  |  |  |  | 293 |
| 40 | `kill` | 2 | 0/2 | 7 |  |  |  |  | yes | 922 |
| 41 | `improveCounter` |  |  | 14 |  |  |  |  | yes | 765 |
| 42 | `escape` | 2 | 2/2 |  |  |  |  |  |  | 42 |
| 43 | `tracking` | 3 | 3/3 |  |  |  |  |  |  | 179 |
| 44 | `gps` | 1 | 1/1 |  |  |  |  |  |  | 98 |
| 45 | `localizers` | 1 | 0/1 |  |  |  |  |  |  | 9 |
| 46 | `followSpecialExits` | 1 | 1/1 |  |  |  | yes |  |  | 114 |
| 47 | `trop` | 1 | 1/1 |  |  |  | yes |  |  | 21 |
| 48 | `mountain` | 5 | 5/5 |  |  |  |  |  |  | 38 |
| 49 | `drowning` | 1 | 1/1 |  |  |  |  |  |  | 24 |
| 50 | `multibinds` |  |  | 6 |  |  |  |  | yes | 430 |
| 51 | `itemCollector` |  |  | 2 |  |  | yes |  |  | 460 |
| 52 | `prettyContainers` | 1 | 1/1 | 1 | **yes** |  |  |  |  | 817 |
| 53 | `bagManager` | 2 | 2/2 | 8 | **yes** |  | yes |  | yes | 321 |
| 54 | `cutting` | 4 | 4/4 | 4 |  |  |  |  |  | 312 |
| 55 | `deposits` | 3 | 0/3 | 4 |  |  |  |  | yes | 364 |
| 56 | `herbShop` | 1 | 1/1 |  |  |  |  |  |  | 93 |
| 57 | `armorShop` |  |  |  |  |  |  |  |  | 20 |
| 58 | `smith` | 4 | 4/4 | 2 |  |  | yes |  |  | 71 |
| 59 | `commandPreserveCaseMode` | 1 | 1/1 |  |  |  |  |  |  | 114 |
| 60 | `herbCounter` | 7 | 0/7 | 15 |  |  |  |  |  | 832 |
| 61 | `herbDescriptions` | 1 | 1/1 |  |  |  |  |  |  | 81 |
| 62 | `lvlCalc` | 4 | 4/4 | 1 |  |  |  |  |  | 461 |
| 63 | `cechyHistory` |  |  | 1 | **yes** |  |  |  |  | 190 |
| 64 | `compareAll` | 1 | 1/1 | 1 | **yes** |  |  |  |  | 245 |
| 65 | `compareInline` | 1 | 1/1 |  |  |  |  |  |  | 69 |
| 66 | `personDescription` | 1 | 1/1 |  |  |  |  |  |  | 45 |
| 67 | `itemCondition` | 3 | 3/3 |  |  |  |  |  |  | 97 |
| 68 | `durability` | 1 | 1/1 |  |  |  |  |  |  | 66 |
| 69 | `wearUsed` | 1 | 1/1 |  |  |  |  |  |  | 69 |
| 70 | `animalTaming` | 1 | 1/1 |  | **yes** |  |  |  |  | 62 |
| 71 | `oswajanie` | 2 | 2/2 |  | **yes** |  | yes |  |  | 868 |
| 72 | `invite` | 1 | 1/1 |  | **yes** |  | yes |  |  | 88 |
| 73 | `objectAliases` |  |  | 27 |  |  |  |  |  | 426 |
| 74 | `magicKeys` | 1 | 1/1 |  |  |  |  |  |  | 19 |
| 75 | `magics` | 1 | 1/1 |  |  |  |  |  |  | 19 |
| 76 | `magic-support` | 5 | 0/5 |  |  |  | yes |  |  | 49 |
| 77 | `spells` | 65 | 65/65 |  |  |  |  |  |  | 717 |
| 78 | `knowledge` | 13 | 13/13 |  | **yes** |  |  |  |  | 2748 |
| 79 | `odlozMagie` | 1 | 1/1 | 1 |  |  | yes |  |  | 102 |
| 80 | `priceEvaluation` | 1 | 0/1 |  |  |  |  |  |  | 48 |
| 81 | `stoneValue` | 1 | 1/1 | 1 |  |  |  |  |  | 38 |
| 82 | `selfEvaluation` | 2 | 2/2 | 3 | **yes** |  |  |  |  | 253 |
| 83 | `skills` | 1 | 1/1 | 1 |  |  |  |  |  | 139 |
| 84 | `languageSkills` | 2 | 2/2 | 2 |  |  |  |  |  | 208 |
| 85 | `coinColors` | 1 | 1/1 |  |  |  |  |  |  | 20 |
| 86 | `weaponColors` | 4 | 4/4 |  |  |  |  |  |  | 82 |
| 87 | `leaderAttackWarning` |  |  |  |  |  |  |  |  | 67 |
| 88 | `breakItem` | 2 | 2/2 |  |  |  | yes |  |  | 48 |
| 89 | `pipe` | 8 | 8/8 | 2 | **yes** |  |  |  |  | 186 |
| 90 | `hpAlert` |  |  |  |  |  | yes |  |  | 73 |
| 91 | `idleFullHp` |  |  |  |  |  |  |  |  | 18 |
| 92 | `fullHpTimer` |  |  |  |  |  |  |  |  | 79 |
| 93 | `teamPanel` |  |  |  |  |  |  |  |  | 63 |
| 94 | `noWeaponAlert` | 1 | 1/1 |  |  |  |  |  |  | 31 |
| 95 | `newMail` | 1 | 1/1 |  |  |  |  |  |  | 13 |
| 96 | `magikZnika` | 1 | 1/1 |  |  |  |  |  |  | 16 |
| 97 | `seasonPrint` | 1 | 1/1 |  |  |  |  |  |  | 29 |
| 98 | `worldRebirth` | 1 | 1/1 |  |  |  |  |  |  | 39 |
| 99 | `dajeCiHighlight` | 1 | 1/1 |  |  |  |  |  |  | 15 |
| 100 | `przybywajaCount` | 1 | 1/1 |  |  |  |  |  |  | 24 |
| 101 | `whoCount` | 2 | 2/2 |  |  |  |  |  |  | 229 |
| 102 | `guildPostfix` | 1 | 1/1 |  |  |  |  |  |  | 65 |
| 103 | `language` | 1 | 1/1 | 3 |  |  |  |  |  | 123 |
| 104 | `shortcuts` |  |  | 7 |  |  |  |  |  | 116 |
| 105 | `letter` | 1 | 1/1 | 1 |  |  |  |  |  | 457 |
| 106 | `shortExits` | 1 | 1/1 |  |  |  |  |  |  | 96 |
| 107 | `externalScripts` |  |  |  |  |  |  |  | yes | 91 |
| 108 | `userAliases` |  |  |  | **yes** |  |  |  |  | 93 |
| 109 | `userTriggers` | 2 | 0/2 |  |  |  | yes |  |  | 298 |
| 110 | `zlom` | 15 | 15/15 | 3 |  |  |  |  |  | 678 |
| 111 | `weaponEvaluation` | 3 | 3/3 |  | **yes** |  |  |  |  | 101 |
| 112 | `armorEvaluation` | 1 | 1/1 |  | **yes** |  |  |  |  | 155 |
| 113 | `parryShieldEvaluation` | 1 | 1/1 |  | **yes** |  |  |  |  | 36 |
| 114 | `specialLocations` | 1 | 0/1 |  |  |  |  |  |  | 16 |
| 115 | `(People)` | — | — | — | — | — | — | — | — | — |
| 116 | `gags` | 1 | 0/1 |  | **yes** |  |  |  |  | 101 |
| 117 | `luaGags` | 3 | 0/3 |  | **yes** |  | yes |  |  | 500 |
| 118 | `combatWindow` | 1 | 1/1 | 4 | **yes** |  |  |  |  | 117 |
| 119 | `combatStats` |  |  | 2 | **yes** |  |  |  |  | 306 |
| 120 | `(initKillTracker)` | — | — | — | — | — | — | — | — | — |
| 121 | `(initPackageHelper)` | — | — | — | — | — | — | — | — | — |
| 122 | `inlineCompassRose` |  |  | 1 |  |  |  |  |  | 452 |
| 123 | `clock` | 2 | 0/2 | 3 |  |  |  | yes |  | 837 |
| 124 | `sunTracker` |  |  | 2 |  |  |  |  |  | 299 |
| 125 | `wyroznienieOptions` | 4 | 4/4 |  | **yes** |  |  |  |  | 110 |
| 126 | `contracts` | 4 | 4/4 | 1 |  |  |  |  |  | 375 |
| 127 | `fishing` | 11 | 11/11 | 1 | **yes** |  | yes |  |  | 301 |
| 128 | `spiderWeb` | 1 | 1/1 |  |  |  | yes |  |  | 18 |
| 129 | `poczta` | 14 | 14/14 | 1 | **yes** |  |  |  |  | 290 |
| 130 | `languageTeacher` | 1 | 1/1 |  |  |  | yes |  |  | 43 |
| 131 | `profession` | 2 | 2/2 |  | **yes** |  |  |  |  | 214 |
| 132 | `introduced` | 2 | 2/2 | 1 |  | yes |  |  |  | 205 |
| 133 | `aligatorEmoji` | 1 | 1/1 |  |  |  |  |  |  | 21 |
| 134 | `staticMapWindow` |  |  | 1 |  |  |  |  |  | 72 |
| 135 | `deliveryStats` | 3 | 0/3 | 1 |  |  |  |  |  | 275 |
| 136 | `afterDeathProgress` | 1 | 1/1 |  |  |  |  |  |  | 30 |
| 137 | `brokilon` | 4 | 4/4 |  |  |  | yes |  |  | 60 |
| 138 | `tideSystem` | 2 | 2/2 | 1 |  |  |  |  |  | 335 |
| 139 | `labyrinth` | 3 | 3/3 | 1 | **yes** | yes |  |  |  | 302 |
| 140 | `rindeLabyrinthMapper` | 1 | 1/1 | 1 | **yes** | yes |  |  |  | 516 |
| 141 | `raonLabyrinthMapper` | 10 | 10/10 | 1 | **yes** | yes | yes |  |  | 1172 |
| 142 | `lootParser` | 4 | 4/4 |  |  | yes |  |  |  | 285 |
| 143 | `messageFlair` | 1 | 1/1 |  | **yes** |  |  |  |  | 129 |
| 144 | `ostatnio` | 1 | 1/1 | 1 | **yes** |  |  |  |  | 73 |
| 145 | `dobOp` |  |  | 4 |  |  |  |  |  | 72 |
| 146 | `dataRefresh` |  |  | 3 |  |  |  |  |  | 55 |
| 147 | `tcolor` | 1 | 1/1 | 1 |  |  |  |  |  | 41 |
| 148 | `opal` |  |  |  |  |  |  |  |  | 31 |
| 149 | `lastSeen` | 1 | 1/1 |  | **yes** |  |  |  |  | 233 |
| 150 | `bilety` |  |  | 1 |  |  |  |  |  | 30 |
