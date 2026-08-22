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
 * Starts scripts, each inside its own ScriptScope, and can stop them again.
 *
 * The id is the script's module name under `src/client/scripts/`. That is what
 * makes the set enumerable — and what `stop` needs, since everything the script
 * registered is filed under it. See docs/SCRIPT_DEPENDENCIES.md.
 */
export class ScriptRegistry {
    private readonly scopes = new Map<string, ScriptScope>();

    constructor(private readonly client: Client) {}

    /** Ids of the scripts currently running, in the order they were started. */
    get running(): string[] {
        return Array.from(this.scopes.keys());
    }

    isRunning(id: string): boolean {
        return this.scopes.has(id);
    }

    start(id: string, run: ScriptStart): void {
        if (this.scopes.has(id)) {
            throw new Error(`Script "${id}" is already running`);
        }
        const {client, scope} = createScriptScope(this.client, id);
        this.scopes.set(id, scope);
        try {
            run(client, client.aliases);
        } catch (error) {
            // Don't leave half a script wired up: whatever it managed to register
            // before it threw goes with the scope.
            this.scopes.delete(id);
            scope.dispose();
            throw error;
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
