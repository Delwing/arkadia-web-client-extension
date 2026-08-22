import type Client from "./Client";
import type {AliasList} from "./AliasList";
import {createScriptScope, type ScriptScope} from "./ScriptScope";

/**
 * How a script gets going. Most are `initX(client)` or `initX(client, aliases)`,
 * which match this directly; the few that need more get a lambda in main.ts.
 * A return value is ignored — the registry hands the script nothing back.
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

/**
 * Starts scripts, each inside its own ScriptScope, and can stop them again.
 *
 * The id is the script's module name under `src/client/scripts/`. That is what
 * makes the set enumerable — and what `stop` needs, since everything the script
 * registered is filed under it. See docs/SCRIPT_DEPENDENCIES.md.
 */
export class ScriptRegistry {
    private readonly scopes = new Map<string, ScriptScope>();
    private readonly meta = new Map<string, ScriptMeta>();

    constructor(private readonly client: Client) {}

    metaFor(id: string): ScriptMeta | undefined {
        return this.meta.get(id);
    }

    /** Ids of the scripts currently running, in the order they were started. */
    get running(): string[] {
        return Array.from(this.scopes.keys());
    }

    isRunning(id: string): boolean {
        return this.scopes.has(id);
    }

    start(id: string, run: ScriptStart, meta?: ScriptMeta): void {
        if (this.scopes.has(id)) {
            throw new Error(`Script "${id}" is already running`);
        }
        // Checked, not sorted. The written order in registerScripts stays the one
        // source of truth for what runs when; a sort would silently repair a bad
        // edit and make the real order a property of an algorithm instead.
        for (const dependency of meta?.after ?? []) {
            if (!this.scopes.has(dependency)) {
                throw new Error(
                    `Script "${id}" declares after: "${dependency}", but that is not running yet — `
                    + `move it earlier in registerScripts`,
                );
            }
        }
        if (meta) {
            this.meta.set(id, meta);
        }
        const {client, scope} = createScriptScope(this.client, id);
        this.scopes.set(id, scope);
        try {
            run(client, client.aliases);
        } catch (error) {
            // Don't leave half a script wired up: whatever it managed to register
            // before it threw goes with the scope, and so does its declaration.
            this.scopes.delete(id);
            this.meta.delete(id);
            scope.dispose();
            throw error;
        }
    }

    /**
     * Check every declared `requires` / `optional` names a script that exists.
     *
     * Call once everything has started. `requires` is about *enablement*, not
     * order — four of the real edges run consumer-first and work because the read
     * happens in a runtime callback — so this cannot be checked at start time.
     */
    verifyDependencies(): void {
        const unknown: string[] = [];
        for (const [id, meta] of this.meta) {
            for (const dependency of [...(meta.requires ?? []), ...(meta.optional ?? [])]) {
                if (!this.scopes.has(dependency)) {
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
        this.meta.delete(id);
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
