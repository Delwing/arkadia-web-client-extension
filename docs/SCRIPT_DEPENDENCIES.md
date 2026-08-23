# Script Dependencies & Load Order

> Analysis of how `src/client/scripts/` modules depend on each other, where the
> ordering constraints actually live, and what has to change before scripts can be
> loaded dynamically or switched off per user.
>
> Written 2026-08-22 against `master` (10c69dc5). Counts come from a full parse of
> `src/client/scripts/**` and `src/client/main.ts`.

## Status

This is the source of truth for the toggle migration, and the numbered stages below
are what "stage N" refers to.

**Stages 0 through 6 have landed.** Scripts run inside disposable scopes, everything
they register is attributed and reversible, dependencies are declared and checked, a
stopped script no longer answers for its data, rebuilding a buffer no longer discards
what earlier triggers decided about the line, and a character can turn any of the 148
off from the settings.

**The migration is finished.** Stage 7 (lazy loading) was built and then dropped on
its own measurement — see *Stage 7* for the numbers and the two conditions that
would justify reopening it.

Where the stages departed from what was originally proposed, the reasoning is kept
in place rather than edited out; each landed section says what changed and why.

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

## Decisions

What the toggle UI needed from a person, and what was chosen. These were open
through stages 4 and 5; all four are settled and stage 6 builds to them.

### 1. A plugin that depends on a disabled script — **warn, naming the plugins**

Three of the module singletons are **public plugin API**, not just internal state
(the third turned up in stage 4, which is why the Channel 2 table lists two):

| Surface | Owner | Reached by |
|---|---|---|
| `addGroupDefinition` / `addTransformDefinition` | `prettyContainers` | plugins write into it via `PluginApi` |
| `getHerbManager()` | `herbCounter` | `PluginApi.herbs.*`, web `HerbManager` |
| `getContainer` / `getContainerForms` | `bagManager` | `PluginApi.containers.*` |

**The toggle goes through, but not silently.** Turning off one of these three first
raises a dialog listing the loaded plugins that have registered against it. The user
decides; a plugin does not get to veto a built-in feature in the user's own client,
and equally the client does not break one behind the user's back.

This needs per-plugin attribution on the three surfaces, which is cheap: `PluginApi`
is already constructed per plugin and carries a `pluginId` (`PluginApi.ts:2534`),
so the registration only has to record who made it. Without attribution the
fallback is a generic warning, which is strictly worse — a warning the user cannot
act on.

Stage 4 deliberately left all three answering rather than pre-empt this.
`getHerbManager()` was already declared `HerbManagerApi | null`, so a plugin was
always meant to handle its absence and 1b made it honest; `getContainer` resets to
the default bag rather than to `null`, and the definition registries are untouched.

### 2. A popup whose script is off — **hide the entry and the popup**

Several web popups read a script's data directly — `LootPopup` (`lootParser`), the
kill and improve popups (`kill`, `improveCounter`). They are not reached through the
script: `outputContextMenu.tsx` emits `zabici.popup.open` itself, so the entry
survives its owner and opens onto the `null` stage 4 introduced.

**The entry goes when the script does.** The deciding argument is that half the doors
already close: the aliases `/zabici` and `/zabiciw` belong to the script's scope and
disappear with it. Leaving a context-menu entry open onto an empty room is the
inconsistent state, not the tidy one. A feature that is off should be gone, not
present-but-hollow.

The rejected alternative — keep the entry, explain inside the popup — is friendlier
to a user who forgot they disabled something, but it needs a written message per
popup and leaves dead UI in place. The settings list is where a user goes to find out
what they turned off.

Both answers need the same new thing: **the running set has to be readable from
`@web`**. The registry lives in the client, so stage 6 has to publish it — an event
on change plus a snapshot getter, in the shape `@modules/core` already uses.

### 3. The 148 labels — **drafted from the code, reviewed by a person**

The toggle UI needs a Polish name and a one-line description per script. A
plausible-but-wrong label in a settings list is worse than no list, so these cannot
simply be generated and shipped.

**Draft all 148 from each script's aliases, trigger patterns and settings keys, then
review the lot.** Reviewing a wrong label is much cheaper than authoring a right one
from a blank page, and the aliases are strong evidence — a script owning `/zabici`
and `/zabici2` is not ambiguous about what it does.

The draft lands as a catalog module rather than as arguments at the 148
`registry.start` calls, which would bury `main.ts`. One file to review, one file to
diff.

**Drafted and reviewed: `src/client/scriptCatalog.ts`, all 148.** Titles come
from the script's own aliases where it has them (`/zabici` → *Licznik zabitych*),
from its trigger patterns where it does not, and from settings keys for the handful
with neither. Six entries the code was least clear about carried a `REVIEW:` marker for the
reviewer. Those markers turned out to render straight into the settings list once
stage 6 shipped, which is how a drafting note became a user-visible artefact; all
are gone and a test now fails on any that come back.

Reviewing them against the running client — not against the source a second time —
found four labels that were simply wrong: `mapAliases` claimed `/idz`, which
belongs to `idz`; `combatWindow` claimed `/walka` and `/postawa`, when the real
commands are `/walka okno` and `/postawa okno`; `language` claimed `/justaw`, which
has no slash; and `aligatorEmoji` was described as a joke when it is a warning that
something is coming through the reeds. Six more scripts turned out to intercept
plain game commands — `cechy`, `um`, `jezyki`, `justaw` — which no description had
mentioned.

Six tests hold the file honest: it covers exactly the registered set in both
directions, every entry has both fields, no two scripts share a title, no
description carries a draft marker, and every `/command` a description names is one
the script really registers.

Curating a smaller toggleable subset was considered and rejected: it makes the
labelling job smaller but moves the judgement call ("is this one worth exposing?")
to the same place, and a script left permanently on because nobody labelled it is a
decision made by omission.

### 4. Where the flags live — **per character**

Not originally on this list; stage 6 cannot be built without it.

`characterStorage`, matching how most script settings are already stored. Which
features are wanted genuinely differs between characters — a fighter and a herbalist
do not want the same set — and the per-character sync path already exists. A global
list would force one feature set on every character; a global default with
per-character overrides buys flexibility that is not worth the extra surface or the
extra ways to be confused about why something is off.

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
| ~~`attackQueue` (20), `objectAliases` (73)~~ | ~~`allyProtection`~~ | **gone** — `allyProtection` is a command hook now, so nobody calls into it | n/a |
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
third-party plugins. That has to be part of the toggle contract. `bagManager`'s
`getContainer` turned out to be a third: it is reached through `PluginApi.containers`.

Stage 4 closed this channel; see *Stage 4: the singletons* for what each getter now
answers when its owner is stopped, and which three deliberately still answer.

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

| Field | Written by | Read by | Verdict |
|---|---|---|---|
| `client.carriageMode` | `carriage` | `moveMode` | **leave** — `MovementManager` state |
| `client.moveMode` | `moveMode` | `zaskTimer` | **leave** — `MovementManager` state |
| `client.suppressItemEvaluation` | `selfEvaluation` | `weaponEvaluation`, `armorEvaluation`, `parryShieldEvaluation` | real, and it leaked |
| `client.herbManager` | `herbCounter` | (type surface only) | redundant with the provider |

**Two of these are not script-to-script coupling at all.** `moveMode` and
`carriageMode` are accessors onto `MovementManager`, which the core reads to prefix
movement commands. The scripts are the trigger-and-bind front end for state the
client owns; `zaskTimer` reading `client.moveMode` at `gmcp.room.info` is reading
core state, which is the intended seam, and it already takes `moveModeChanged` for
the transitions. Converting them to events would mean `zaskTimer` mirroring state it
can simply read — strictly worse. They stay.

**What was actually wrong was teardown, not shape.** Both remaining fields are
latches that a stop could leave set:

- `suppressItemEvaluation` mutes the three evaluation scripts for the duration of a
  bulk `/ocen` read-out. Stop `selfEvaluation` mid-read and all three stay silent for
  good. Now reset on dispose.
- `enemyBinds` assigns `client.attackEnemySlot` / `blockEnemySlot`, which `Client`
  declares as no-op stubs. Stopping it left the implementations installed, so the
  mobile buttons kept firing attacks through a script that was no longer running. The
  own properties are now deleted on dispose, so the stubs show through again.

That second one also exposed a bug in the scope's own client facade: it cached bound
methods by property name and never invalidated, so after a script assigned a function
onto the client, reads returned a wrapper around the function that used to be there.
The cache now keys on the function identity too.

### Channel 3 needs nothing

The 8 event edges were to be formalised as declared `provides`/`requires`. They are
already late-bound, and a missing emitter degrades to "the event never fires" — the
correct failure mode, and one the toggle UI wants anyway. Declaring them would add
bookkeeping without changing a single outcome.

The remaining `client.*` surface used by scripts is read-only API:
`Triggers`(106 users), `on`(52), `sendCommand`(46), `println`(42), `sendEvent`(39),
`Map`(30), `print`(26), `FunctionalBind`(22), `TeamManager`(20), `aliases`(15).

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
   `AnsiAwareBuffer`, and `flair` only survived an explicit clone. This is why
   `main.ts` carried the comment that `initLootParser` must precede
   `initMessageFlair` — the only such constraint written down; the others were
   folklore. **Closed in stage 5** by `AnsiAwareBuffer.replaceWith`, which also
   turned out to be dropping the deleted mark.

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

> **Landed in stage 0b.** What follows is the reasoning, kept in the tense it was
> written in. The "proposed fix" below is what `Triggers.parseLine` now does, and
> `TriggerOptions.skipDeleted` is the opt-out it needed.

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
| Storage listeners | `storage.onChange` returns an unsubscribe fn ✔ | 43 sites across 36 scripts; none keep the handle. **Missed by this survey the first time round** — found in stage 4, where it turned out to be what made the singleton resets not hold |

Every row above is closed as of stage 4: triggers and aliases by `owner`, subscriptions
and timers and DOM listeners by the scope, singletons by typed absence, storage
listeners by `scope.onDispose`. The two that deliberately remain open — the
`prettyContainers` registry and the providers reached through `PluginApi` — are
decision 1.

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

`herbCounter` is the one script that registers a provider, and it now withdraws it
on dispose — `getHerbManager()` returns `null`, which `pipe` and the herb UI already
handle. What the scope still does **not** reclaim is the 9 module-level singletons;
that is stage 4.

### 2. Dependencies declared at the registration — **landed**

Declared where the script is started, not exported from the module:

```ts
registry.start('pipe', initPipe, {requires: ['herbCounter']})
registry.start('combatWindow', initCombatWindow, {after: ['gags', 'luaGags']})
```

The plan put this in each script as `export const manifest`. It lives in the central
table instead, because stage 7 wants the metadata **without loading the module** — a
per-module manifest makes reading a script's title as expensive as running it. That
table already exists as `registerScripts`; this only adds columns to it.

`title` is deliberately absent. The toggle UI needs a Polish label per script, and
inventing 148 of them belongs with that UI, where they can be reviewed.

### 3. Ordering without phases — **landed as a check, not a sort**

The plan called for a stable topological sort. The registry **verifies** instead:
`after` means "must already be running", checked at `start`, throwing and naming the
edge when it does not hold.

A sort would silently repair a bad edit, and would make the real order a property of
an algorithm rather than of the file. Checking keeps `registerScripts` the single
answer to "what runs when", and fails loudly at startup when someone moves a line
that matters. It is also less code — and there are only two edges to hold.

**`requires` is not an ordering constraint.** Four of the real edges run
consumer-first — `itemCollector`(51)→`lootParser`(142), `idz`(39)→`shortcuts`(104),
`prettyContainers`(52)→`fishing`(127), `luaGags`(117)→`combatStats`(119) — and work
because every read happens inside a runtime callback. So `requires` means *must be
enabled* (cascade on toggle) and is checked once at the end of registration, never at
start. Conflating the two would make four legitimate edges look like cycles.

What is declared today:

| Kind | Edges |
|---|---|
| `after` | `combatWindow` after `gags`/`luaGags` — the only one left; `messageFlair`'s went in stage 5 |
| `requires` | `pipe`→`herbCounter`; `idz`/`mapAliases`→`shortcuts`; both labyrinth mappers→`shortExits`; `cechyHistory`→`lvlCalc` |
| `optional` | 11 more, each taken from the break-mode column of the table above |

The `messageFlair` edge stopped existing in stage 5 rather than being scheduled
around. The one that remains is real: `combatWindow` registers with
`{skipDeleted: true}`, which is evaluated at dispatch, so it has to run after
whoever sets the mark.

### 3b. What is enforced

No phases means no phase enforcement. What the registry does enforce:

| Rule | How |
|---|---|
| Declared `after` edges hold | checked at `start`; throws naming the edge that moved — **landed** |
| Dependencies exist | `verifyDependencies()` after registration; throws listing every unknown id — **landed** |
| Disabling cascades | a script whose `requires` is disabled is disabled too; `optional` just degrades — declared, not yet acted on (stage 6) |
| Teardown is total | the scope records every trigger, alias, event listener, command hook, interval, DOM handler and storage listener — **landed**; `registerScripts.test.ts` starts all 148, stops them, and asserts nothing owned survives and no getter still answers |
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
| ~~**2**~~ | ~~Add `manifest` + registry~~ — **done**, with the sort dropped: `after` / `requires` / `optional` are declared at the `registry.start` call and **checked**, not sorted. `test/client/registerScripts.test.ts` starts all 148 for real and proves the written order satisfies them | none | landed |
| ~~**3**~~ | ~~Replace the 4 shared `client` fields~~ — **mostly declined**, see below. Two of the four are core state, and the 8 event edges were already fine. What was real — two latches left set when their script stops — is fixed | none | landed |
| ~~**4**~~ | ~~The 9 module singletons~~ — **done** as *typed absence*, not a service locator: each getter answers absent once its owner stops, reset in a `client.scope.onDispose`. Three keep answering on purpose (two are plugin API, one has no owner). Dragged in **4a**: the 43 dropped `storage.onChange` unsubscribes, without which the resets do not hold | none | landed |
| ~~**5**~~ | ~~Add `line.replaceWith(next)`~~ — **done**, and it turned out to be a bug fix rather than a tidy-up: a rebuilt buffer dropped the deleted mark, so a gagged line came back on screen and `skipDeleted` stopped working. `messageFlair` lost its `after` edge; one `after` edge remains and is legitimate | **yes** — a gagged line stays gagged | landed |
| ~~**6**~~ | ~~Dynamic enable/disable UI~~ — **done**: per-character flags, `declare`/`launch` so the requires cascade can be resolved, a Funkcje modal off `scriptCatalog`, menu entries filtered by owner, and a dialog naming the plugins a toggle would affect. See *Stage 6* below | **yes** | landed |
| ~~**7**~~ | ~~Lazy `import()` per script~~ — **built and dropped**: one chunk per script shrank the entry chunk 1046 KB → 33 KB but pushed time-to-interactive 1308 ms → 2112 ms, charged to every user including those with nothing disabled. See *Stage 7* | — | not shipped |

Three stages changed behaviour: 0b (suppression became a fold), 5 (a gagged line stays
gagged through a rebuild) and 6 (features can be off). The rest were no-ops that landed
incrementally.

### Stage 4: the singletons — landed as typed absence

The singletons were the last thing a stopped script left behind. The owner's data
outlived it: stop `kill` and `getKillData()` still returned the totals it had
accumulated, so `improveCounter` and the web popups kept reading numbers from a
script that was no longer running.

Of the two readings of "convert to registry-resolved services", the cheaper one is
what landed. **Typed absence:** the module getters stay where they are, each answers
absent once its owner has stopped, and the state is reset in a
`client.scope.onDispose`. A **service locator** — register each service on the
registry, resolve it by id — was considered and dropped: it buys compile-time
dependency wiring, but the conversion runs through `kill` (922 lines), `zlom` (678),
`lootParser` and `improveCounter`, none of which is split along the lines a service
boundary would need, and its only user-visible effect is the same `null` the cheap
version produces. If something later needs resolution by id — a plugin swapping an
implementation — it layers on top of this without redoing it.

The answer at the boundary is **absent, not empty**. `getLifetimeData()` used to
return `[]` for a stopped counter, which is the same thing it returns for a
character who has never improved; it now returns `null` for the first and `[]` for
the second.

| Owner | Getter | Stopped |
|---|---|---|
| `kill` | `getKillData()`, `getLifetimeKillData()` | `null` |
| `improveCounter` | `getImproveData()`, `getLifetimeData()` | `null` |
| `lootParser` | `getRoomContents()`, `getBodyExtras()`, `getBodyStertyMap()` | `null` |
| `zlom` | `getZlomFormatting(name)` | `undefined` |
| `prettyContainers` | `getItemCssColor(name)` | `undefined` |
| `shortcuts` | `getShortcut(id)` | `undefined` |
| `herbCounter` | `getHerbManager()` | `null` — landed in 1b |
| `bagManager` | `getContainer(type)` | **default bag** — see below |
| `prettyContainers` | `addGroupDefinition`, `addTransformDefinition` | **unchanged** — see below |
| `enemyBindResolvers` | resolver registry | nothing to do — plugins own the entries and `PluginManager` unwinds them |

Three of the nine keep answering, on purpose:

- **`getContainer`** and **the definition registries** are public plugin API. A
  plugin that has already registered against them would be the one to break, and
  what it should see is decision 1 in *Open decisions* — a product call, not this
  stage's to make. `bagManager` resets to the default bag rather than to the
  character's choice, and the definition registries are left entirely alone.
- **`enemyBindResolvers`** is a `lib/` registry with no owning script.

Two things the readers had to learn. `killTracker`'s `/loot` now falls back to the
bodies it counted itself and offers nothing from the ground, which is the honest
answer when nobody parsed it — it gained `optional: ['lootParser']` to say so.
`itemCollector` null-guards the two body maps.

**These are runtime guarantees, not compile-time ones.** The repo builds with
`strict: false`, so a `| null` return type does not make a caller handle it — tsc
will not flag `getRoomContents().bodies`. The contract is held by
`test/client/registerScripts.test.ts`, which starts all 148 scripts for real and
asserts every getter above answers absent after `stopAll()`. Turning on
`strictNullChecks` would upgrade the whole set from tested to proven; that is a
bigger job than this stage and is not on the plan.

### Stage 4a: storage listeners — the channel 1b missed

Stage 4 could not hold without this. `TypedStorage.onChange` returns an unsubscribe
and 43 call sites in `scripts/` dropped it, so a stopped script kept its listener:
the next settings change refilled the very state `stop` had just cleared. `shortcuts`
was the clearest case — clear the lookup table, edit a shortcut in the options, and a
script nobody is running starts resolving names again. Worse, `zlom`'s listener
re-registers triggers, which on a disposed scope would leak them permanently.

Every site now hands the unsubscribe to `client.scope.onDispose`, including
`BaseCounter.onStorageChange`, which covers `kill` and `improveCounter`. A test
sweeps `scripts/` and `scripts/lib/` and fails on any subscription whose return value
is dropped — it looks at what precedes the call rather than matching a fixed wrapper,
so the `cechyHistory` shape (collect the unsubscribes, return one disposer) passes
too.

That shape is now supported directly: **a script may return a teardown function from
its init**, and `ScriptRegistry.start` registers it on the scope. `cechyHistory` had
been returning one all along into a `ScriptStart` signature that ignored it.

### Stage 5: buffer replacement stopped discarding decisions

44 scripts build a fresh `AnsiAwareBuffer` instead of mutating the one they were
handed, and `Trigger.execute` took the result with a bare `line = result`. Everything
an earlier trigger had decided about that line lived on the old buffer, so the
replacement threw it away — silently, and depending only on registration order.

`AnsiAwareBuffer.replaceWith(next)` now carries the side-band metadata across, and
`Trigger.execute` goes through it. `flair`, the deleted mark and `originalText`
travel; anything the replacement set for itself wins, except the deleted mark, which
is one-way by design. `onRender` deliberately does not travel — it is bound to
content the rebuild has already thrown away.

**This fixed a real bug, not just an ordering wart.** Since stage 0b, suppression is
a fold: a gag calls `markAsDeleted()` and the line keeps travelling so later scripts
still see it. But `gags`(116) and `luaGags`(117) sit late with 34 scripts after them,
and any one of those rebuilding the buffer dropped the deleted mark — putting the
gagged line back on screen. It also defeated `skipDeleted`, which stage 0b added
precisely so `combatWindow` could opt out of suppressed lines: a rebuild in between
made the line look live again. Both are covered in `test/client/Triggers.test.ts`.

So stage 5 does change behaviour, where the migration plan predicted it would not.
The change is that a gagged line stays gagged.

**`messageFlair` lost its `after: ['lootParser']` edge** — the point of the stage. A
test asserts the two now give the same answer in either order. The edge was also
over-stated: `lootParser` uses `clone()`, which already copied `flair`, so the
concrete case it named had been fixed at some point without the comment being
updated. The hole it described was real, just wider than one pair of scripts.

**One `after` edge remains, and it is the honest kind.** `combatWindow` after
`gags`/`luaGags` is not about metadata surviving a rebuild — `combatWindow` registers
with `{skipDeleted: true}`, which is evaluated at dispatch, so it genuinely has to
run after whoever sets the mark. `replaceWith` cannot dissolve that and should not:
`after` now means one thing only, "this trigger's dispatch depends on a decision
another script takes on the same line", and exactly one script needs it.

### Stage 6: the toggle UI

A character can turn any of the 148 scripts off, from a "Funkcje" modal that
lists them by the name `scriptCatalog` gives them.

**Declaring had to become separate from starting.** The `requires` cascade cannot
be resolved one script at a time: `requires` names a *dependency*, not a
predecessor, and four of the real edges legitimately name a script declared later.
Only once the whole plan is known can "is anything this needs turned off?" be
answered. So `registry.start(id, run, meta)` became `registry.declare(...)` plus a
single `registry.launch()`, and `start`/`stop` now mean "one script, right now".

| Concern | Where it landed |
|---|---|
| The choices | `characterStorage.disabled_scripts`, through a `DisabledScriptStore` port |
| Which scripts run | `ScriptRegistry.launch()`, skipping disabled and blocked |
| Cascade | `blockedBy` walks `requires` transitively, cycle-safe |
| Telling the UI | `scripts.stateChanged` on the event bus |
| The list | `src/web/options/Features.tsx`, reading the live registry |
| Menu entries | `ownedByRunning` in `src/web/scriptState.ts` |
| Plugin warning | `@modules/core/pluginScriptUsage`, recorded in `PluginApi` |

**Only the user's own choices are stored.** The cascade is derived on every read,
so re-enabling a dependency brings its dependants back with no second round of
bookkeeping — and a stored cascade could never be told apart from a deliberate
choice, which would leave a dependant off for good. A dependant the user turned
off by hand stays off when its dependency returns.

**`off` and `blocked` are different states.** `stateOf` distinguishes them and the
switch renders them differently: blocked is shown off *and locked*, with a
`wymaga: <name>` badge. Locking it is the point — the switch that needs turning
back on is the dependency's, and an enabled-looking switch that cannot start
anything would be a lie.

**`after` is no longer violated by a target being turned off.** `after` is about
sequence, and a script that is not running has no sequence to be in. Throwing
there would make disabling `gags` take `combatWindow` with it, which is what
`requires` is for. `verifyDependencies` likewise now checks against the plan
rather than against what is running: turned off is legitimate, never declared is a
typo.

**Decision 2 needed a second half.** The aliases go with the scope on their own,
but the output context menu builds its entries in `@web` and emits the popup event
directly, so those entries outlived their scripts. Each is now tagged with the
script it opens and filtered through `ownedByRunning`.

**Decision 1 needed attribution first.** `pluginScriptUsage` records which plugin
touched which script-owned surface, written at the three `PluginApi` sites
(`prettyContainers` definitions, `containers`, `herbs`). Disabling one of those
three raises a dialog naming the affected plugins; the user can go ahead. Unloading
a plugin forgets its usage, since it can no longer be broken. Usage is remembered
rather than sampled: a plugin that registered a filter at load time and never
called again is exactly the one that would break quietly.

**`registerScripts` also gathered the client's own registrations** — the `/blokada`
and `/reload-plugins` aliases, the four providers, the pager ENTER trigger — into
one block ahead of the plan. They had been scattered among the declarations, so
their position in the alias list and the trigger fold depended on which script they
happened to sit next to. They are not scripts and are never toggleable.

What stage 6 does *not* do: the popups themselves still open if something else
emits their event. Only the doors this client owns are closed.

### The feature preview

Each row in the Funkcje list opens a dialog showing what that script is: the
commands it currently answers, how many triggers it has on the output, and its
source.

The commands are read from the live client — `registry.surfaceOf(id)` filters
`client.aliases` and `Triggers.countByOwner` by the owner the scope stamped — not
from a description someone maintains by hand, so it cannot drift from what the
script really did. Alias patterns are regexes, so `describeAliasPattern` takes the
literal head and marks the rest with an ellipsis: `/^\/zabici2 (\d{4})$/` reads as
`/zabici2 …`. A script that is turned off has registered nothing and says so —
that is the teardown working, not missing data — while its source is still there
to read, which is the state you are usually in when deciding to switch it on.

The source is fetched on demand through `import.meta.glob(..., { query: "?raw" })`,
so each script is also a chunk of plain text that is only requested when a preview
is opened. That is the same mechanism stage 7 was rejected for, used the other way
round: there every user paid for laziness they had not asked for, here nobody pays
unless they open a preview. The entry chunk is unchanged at 1047 KB.

It is a dialog rather than an expanding row because the settings list already
scrolls, and a scrollable code block inside a scrollable list leaves two nested
scrollbars competing for the same wheel.

### Stage 7: lazy loading — built, measured, and dropped

The plan's last stage was to put each script behind a dynamic `import()` so a
turned-off one is never downloaded. It was built in full — loader thunks in the
registry, all 148 declarations converted, an async `launch`, a startup gate on the
transport so the socket cannot open before triggers are registered — and then
reverted, because the measurement does not support it.

| | entry chunk | chunks | time to interactive |
|---|---|---|---|
| Static imports (what ships) | 1046 KB | 514 | **1308 ms** |
| One chunk per script | 33 KB | 702 | **2112 ms** |

Five runs each, single worker, `vite preview` — the same server the e2e suite uses.
Total bytes were unchanged (26.6 MB either way), so nothing was duplicated; the
entry chunk really did shrink by 30×. It did not matter. Fetching ~150 small files
costs more than the 1 MB bundle it replaces, and **the default user pays that in
full**: they have nothing disabled, so they download exactly the same code in 150
requests instead of one. The saving only exists for someone who has turned scripts
off, and it is charged to everyone who has not.

It also showed up as two `feature-toggles` tests timing out once the file's eight
tests ran in parallel — not flakes, the real cost under contention.

**The caveat, stated because it could change the answer.** `vite preview` is
HTTP/1.1, which caps concurrency at about six connections per origin, so 150 files
serialise into ~25 rounds. Production is GitHub Pages over HTTP/2, where that
penalty is much smaller and the result could invert. Measuring that needs an
HTTP/2 origin, which is why this is recorded as *not proven worthwhile* rather than
*proven harmful*.

**What stage 7 was actually for is already done.** Stage 6 gives the user-visible
behaviour: a disabled script does not run, registers nothing, and leaves nothing
behind. Stage 7 only ever saved bytes and parse time on top of that. Reopen it if
either of these changes:

- the client moves to an HTTP/2 or HTTP/3 origin *and* someone re-measures there;
- a large script grows enough to be worth splitting on its own. Ten scripts hold
  ~400 KB of the 1086 KB (`knowledge` alone is 101 KB), and splitting only those
  is ten extra requests rather than 148 — a far better ratio than all-or-nothing.

The seam is ready either way: the registry's plan already holds one entry per id,
so swapping a value for a thunk is a local change.

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
