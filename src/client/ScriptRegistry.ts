import type Client from "./Client";
import type {AliasList} from "./AliasList";
import {createScriptScope, type ScriptScope} from "./ScriptScope";
import eventBus from "@modules/core/eventBus";

/**
 * How a script gets going. Most are `initX(client)` or `initX(client, aliases)`,
 * which match this directly; the few that need more get a lambda in main.ts.
 * A returned function is taken as a teardown and runs when the script stops, for
 * the cases a `client.scope.onDispose` at the registration site cannot express —
 * a script that already collects its own unsubscribes, say. Any other return
 * value is ignored.
 */
export type ScriptStart = (client: Client, aliases: AliasList) => unknown;

/**
 * What a script needs from the others. All three are about *dependencies* — none
 * of them is a schedule. See docs/SCRIPT_DEPENDENCIES.md.
 */
export interface ScriptMeta {
    /**
     * Must already be running when this one starts.
     *
     * Rare and load-bearing: only for a script that reads what another produced
     * *during registration*, which since stage 0b means only the two that tee or
     * tag a buffer another script has already finished with. Not a general
     * ordering knob — if a script merely reads another's state at runtime, it
     * wants `requires`, not this.
     */
    after?: string[];

    /** Cannot do its job at all without these. Disabling one disables this too. */
    requires?: string[];

    /** Uses these when present and degrades gracefully when not. */
    optional?: string[];
}

/** Why a declared script is not running. */
export type ScriptState =
    | {status: 'running'}
    /** The user turned this one off. */
    | {status: 'off'}
    /** Something it requires is off, so it cannot run either. */
    | {status: 'blocked'; by: string};

/**
 * Where the user's on/off choices live. Per character — which features you want
 * genuinely differs between a fighter and a herbalist. See
 * docs/SCRIPT_DEPENDENCIES.md, *Decisions* §4.
 *
 * A port rather than a direct `characterStorage` import so the registry stays
 * testable and the client core stays free of a storage dependency it would only
 * need for this.
 */
export interface DisabledScriptStore {
    read(): string[];
    write(ids: string[]): void;
}

/** Nothing disabled, nothing persisted. What tests and a headless client get. */
const memoryStore = (): DisabledScriptStore => {
    let ids: string[] = [];
    return {read: () => ids, write: next => { ids = next; }};
};

/** What a running script currently has registered on the client. */
export interface ScriptSurface {
    /** The commands it answers, as a user would type them. */
    commands: string[];
    /** How many triggers it has on the output, children included. */
    triggers: number;
}

/**
 * The readable head of an alias pattern.
 *
 * Alias patterns are regexes — `/^\/zabici2 (\d{4})$/` — and the part worth
 * showing a reader is the literal text before the pattern starts matching
 * arguments. So drop the anchors and stop at the first metacharacter. Anything
 * that had more after it gets an ellipsis, so a command that takes arguments
 * does not read as the whole thing.
 */
export function describeAliasPattern(pattern: RegExp): string | null {
    const anchored = pattern.source;
    let source = anchored;
    if (source.startsWith('^')) source = source.slice(1);
    if (source.endsWith('$')) source = source.slice(0, -1);

    let literal = '';
    let consumed = 0;
    for (let i = 0; i < source.length; i++) {
        const c = source[i];
        if (c === '\\') {
            const next = source[i + 1];
            // An escaped literal (\/, \., \+) contributes the character itself;
            // a character class (\d, \w, \s) means the arguments have started.
            if (next && !/[dDwWsSbBnrtfvux0-9kpP]/.test(next)) {
                literal += next;
                i++;
                consumed = i + 1;
                continue;
            }
            break;
        }
        if ('([{|?*+.'.includes(c)) break;
        literal += c;
        consumed = i + 1;
    }

    // Drop a dangling opening quote or bracket: /usun_skrot "([^"]+)" leaves a
    // trailing " that is part of the pattern, not part of what anyone types.
    const trimmed = literal.trim().replace(/["'([{<]+$/, "").trim();
    if (!trimmed) return null;
    return consumed < source.length ? `${trimmed} …` : trimmed;
}

interface PlanEntry {
    run: ScriptStart;
    meta: ScriptMeta;
}

/**
 * Declares scripts, starts the enabled ones inside their own ScriptScope, and can
 * turn them on and off again afterwards.
 *
 * The id is the script's module name under `src/client/scripts/`. That is what
 * makes the set enumerable — and what `stop` needs, since everything the script
 * registered is filed under it. See docs/SCRIPT_DEPENDENCIES.md.
 *
 * Declaring is separate from starting because the `requires` cascade cannot be
 * resolved one script at a time: `requires` names a *dependency*, not a
 * predecessor, and four of the real edges legitimately name a script declared
 * later. Only once the whole plan is known can "is anything this needs turned
 * off?" be answered.
 */
export class ScriptRegistry {
    /** Every script, in declared order. Survives a script being turned off. */
    private readonly plan = new Map<string, PlanEntry>();
    /** Only the running ones. */
    private readonly scopes = new Map<string, ScriptScope>();
    private readonly userDisabled = new Set<string>();
    private launched = false;

    constructor(
        private readonly client: Client,
        private readonly store: DisabledScriptStore = memoryStore(),
    ) {
        for (const id of this.store.read()) {
            this.userDisabled.add(id);
        }
    }

    metaFor(id: string): ScriptMeta | undefined {
        return this.plan.get(id)?.meta;
    }


    /**
     * What the script currently has registered, for showing a user what a
     * feature actually gives them.
     *
     * Read from the live client rather than from a description someone wrote:
     * the aliases and triggers carry the owner stamped on them by the scope, so
     * this cannot drift from what the script really did. A script that is not
     * running has registered nothing, and says so — that is teardown working,
     * not missing data.
     */
    surfaceOf(id: string): ScriptSurface {
        if (!this.scopes.has(id)) {
            return {commands: [], triggers: 0};
        }
        const commands: string[] = [];
        for (const alias of this.client.aliases) {
            if (alias.owner !== id) continue;
            const described = describeAliasPattern(alias.pattern);
            if (described && !commands.includes(described)) {
                commands.push(described);
            }
        }
        // A command that exists both bare and with arguments — /zabici2 and
        // /zabici2 <data> — is one command. Listing both reads as two.
        const bare = new Set(commands.filter(command => !command.endsWith(" …")));
        return {
            commands: commands.filter(command =>
                !command.endsWith(" …") || !bare.has(command.slice(0, -2))),
            triggers: this.client.Triggers.countByOwner(id),
        };
    }

    /** Every script known to the registry, running or not, in declared order. */
    get declared(): string[] {
        return Array.from(this.plan.keys());
    }

    /** Ids of the scripts currently running, in the order they were started. */
    get running(): string[] {
        return Array.from(this.scopes.keys());
    }

    isRunning(id: string): boolean {
        return this.scopes.has(id);
    }

    /** True when the user has not turned it off and nothing it requires is off. */
    isEnabled(id: string): boolean {
        return !this.blockedBy(id) && !this.userDisabled.has(id);
    }

    /** Running, off by choice, or blocked by something it requires. */
    stateOf(id: string): ScriptState | undefined {
        if (!this.plan.has(id)) return undefined;
        if (this.scopes.has(id)) return {status: 'running'};
        if (this.userDisabled.has(id)) return {status: 'off'};
        const by = this.blockedBy(id);
        return by ? {status: 'blocked', by} : {status: 'off'};
    }

    /**
     * The turned-off script this one is waiting on, if any.
     *
     * Walks `requires` transitively, so turning off `shortcuts` blocks `idz`, and
     * anything that requires `idz` in turn. The `seen` set is not defensive
     * decoration: `requires` is a declaration, and nothing stops someone writing
     * a cycle into one.
     */
    private blockedBy(id: string, seen = new Set<string>()): string | undefined {
        if (seen.has(id)) return undefined;
        seen.add(id);
        for (const dependency of this.plan.get(id)?.meta.requires ?? []) {
            if (this.userDisabled.has(dependency)) return dependency;
            const deeper = this.blockedBy(dependency, seen);
            if (deeper) return deeper;
        }
        return undefined;
    }

    /** Add a script to the plan. Does not start it — see `launch`. */
    declare(id: string, run: ScriptStart, meta: ScriptMeta = {}): void {
        if (this.plan.has(id)) {
            throw new Error(`Script "${id}" is already declared`);
        }
        this.plan.set(id, {run, meta});
    }

    /**
     * Start every enabled script, in declared order.
     *
     * Call once, after the whole plan is declared. Scripts the user has turned
     * off — and everything blocked behind one — are skipped, and stay skippable:
     * `enable` starts them later without a reload.
     */
    launch(): void {
        if (this.launched) {
            throw new Error('Scripts have already been launched');
        }
        this.launched = true;
        for (const id of this.plan.keys()) {
            if (this.isEnabled(id)) {
                this.startNow(id);
            }
        }
        this.verifyDependencies();
        this.publish();
    }

    /**
     * Turn a script on and start it, along with anything that was only blocked
     * waiting for it.
     *
     * Returns the ids that actually started.
     */
    enable(id: string): string[] {
        if (!this.plan.has(id)) {
            throw new Error(`Script "${id}" is not declared`);
        }
        if (!this.userDisabled.delete(id)) {
            return [];
        }
        this.persist();
        // Declared order, not just this one: unblocking `shortcuts` has to start
        // `idz` too, and `idz` must start in its own place in the sequence.
        const started: string[] = [];
        for (const candidate of this.plan.keys()) {
            if (!this.scopes.has(candidate) && this.isEnabled(candidate)) {
                this.startNow(candidate);
                started.push(candidate);
            }
        }
        this.publish();
        return started;
    }

    /**
     * Turn a script off and stop it, along with everything that requires it.
     *
     * Returns the ids that actually stopped.
     */
    disable(id: string): string[] {
        if (!this.plan.has(id)) {
            throw new Error(`Script "${id}" is not declared`);
        }
        if (this.userDisabled.has(id)) {
            return [];
        }
        this.userDisabled.add(id);
        this.persist();
        // Reverse declared order, so a script is stopped before whatever it was
        // reading from goes away underneath it.
        const stopped: string[] = [];
        for (const candidate of Array.from(this.plan.keys()).reverse()) {
            if (this.scopes.has(candidate) && !this.isEnabled(candidate)) {
                this.stop(candidate);
                stopped.push(candidate);
            }
        }
        this.publish();
        return stopped;
    }

    /** The scripts the user has turned off by hand, cascade excluded. */
    get disabled(): string[] {
        return Array.from(this.userDisabled);
    }

    private persist(): void {
        this.store.write(Array.from(this.userDisabled));
    }

    /**
     * Tell the UI what is running.
     *
     * The registry lives in the client and the settings list, the context menus
     * and the popups live in `@web`, so the running set has to travel. Everything
     * that hides itself when its owner is off reads this.
     */
    private publish(): void {
        eventBus.emit('scripts.stateChanged', {
            running: this.running,
            disabled: this.disabled,
        });
    }

    private startNow(id: string): void {
        const entry = this.plan.get(id)!;
        // Checked, not sorted. The written order in registerScripts stays the one
        // source of truth for what runs when; a sort would silently repair a bad
        // edit and make the real order a property of an algorithm instead.
        //
        // A target the user has turned off is not a violation — `after` is about
        // sequence, and a script that is not running has no sequence to be in.
        for (const dependency of entry.meta.after ?? []) {
            if (this.isEnabled(dependency) && !this.scopes.has(dependency)) {
                throw new Error(
                    `Script "${id}" declares after: "${dependency}", but that is not running yet — `
                    + `move it earlier in registerScripts`,
                );
            }
        }
        const {client, scope} = createScriptScope(this.client, id);
        this.scopes.set(id, scope);
        try {
            const teardown = entry.run(client, client.aliases);
            if (typeof teardown === "function") {
                scope.onDispose(teardown as () => void);
            }
        } catch (error) {
            // Don't leave half a script wired up: whatever it managed to register
            // before it threw goes with the scope. The plan entry stays, so the
            // script can be tried again by toggling it.
            this.scopes.delete(id);
            scope.dispose();
            throw error;
        }
    }

    /**
     * Check every declared `requires` / `optional` names a script that exists.
     *
     * Checked against the *plan*, not against what is running: a dependency that
     * is merely turned off is a legitimate state, while one that was never
     * declared is a typo.
     */
    verifyDependencies(): void {
        const unknown: string[] = [];
        for (const [id, entry] of this.plan) {
            for (const dependency of [...(entry.meta.requires ?? []), ...(entry.meta.optional ?? [])]) {
                if (!this.plan.has(dependency)) {
                    unknown.push(`${id} -> ${dependency}`);
                }
            }
        }
        if (unknown.length) {
            throw new Error(`Scripts declare dependencies that are not registered: ${unknown.join(', ')}`);
        }
    }

    /** Undo everything the script registered. Returns false if it wasn't running. */
    stop(id: string): boolean {
        const scope = this.scopes.get(id);
        if (!scope) return false;
        this.scopes.delete(id);
        scope.dispose();
        return true;
    }

    /** Stop everything, newest first, so a script sees its dependencies go last. */
    stopAll(): void {
        for (const id of this.running.reverse()) {
            this.stop(id);
        }
    }
}
