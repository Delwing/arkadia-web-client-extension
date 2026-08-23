import type Client from "./Client";
import type Triggers from "./Triggers";
import type {AliasEntry, AliasList} from "./AliasList";
import type {CommandHookCallback} from "./CommandProcessor";

/**
 * Opaque timer handle. Declared as `number` — the browser's shape, and what the
 * scripts already store — so a scope timer is a drop-in for `window.setInterval`.
 */
export type TimerHandle = number;

/**
 * Everything one script registered, tracked so it can all be undone.
 *
 * A script is only toggleable if turning it off leaves nothing behind. Triggers
 * and aliases carry an `owner` and are swept by id; the rest — timers, DOM
 * listeners, event-bus subscriptions, command hooks — is tracked here.
 *
 * Reach it as `client.scope` from inside a script. On the plain client that is a
 * root scope nobody disposes, so a script behaves the same whether it was started
 * through the registry or handed a bare client in a test.
 *
 * See docs/SCRIPT_DEPENDENCIES.md.
 */
export interface ScriptScope {
    /** Registry id of the owning script. `client` for the root scope. */
    readonly id: string;
    /** Aborted by dispose(). Pass it to anything that takes one. */
    readonly signal: AbortSignal;
    readonly disposed: boolean;

    /** setInterval, cleared on dispose. */
    interval(handler: () => void, ms: number): TimerHandle;

    /** setTimeout, cleared on dispose if it has not fired yet. */
    timeout(handler: () => void, ms: number): TimerHandle;

    /**
     * addEventListener, removed on dispose. The scope supplies the `signal`, so
     * one passed in `options` is ignored; `once` and `capture` work as usual.
     * Returns a remove function for callers that need to unlisten earlier.
     */
    listen<K extends keyof WindowEventMap>(
        target: Window,
        type: K,
        handler: (event: WindowEventMap[K]) => void,
        options?: AddEventListenerOptions | boolean,
    ): () => void;
    listen<K extends keyof HTMLElementEventMap>(
        target: HTMLElement,
        type: K,
        handler: (event: HTMLElementEventMap[K]) => void,
        options?: AddEventListenerOptions | boolean,
    ): () => void;
    listen(
        target: EventTarget,
        type: string,
        handler: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean,
    ): () => void;

    /** Run `fn` when this scope is disposed — or right now if it already was. */
    onDispose(fn: () => void): void;

    /** Undo everything registered through this scope. Idempotent. */
    dispose(): void;
}

class Scope implements ScriptScope {
    private readonly controller = new AbortController();
    private readonly intervals = new Set<TimerHandle>();
    private readonly timeouts = new Set<TimerHandle>();
    private readonly teardowns: (() => void)[] = [];
    private isDisposed = false;

    constructor(readonly id: string) {}

    get signal(): AbortSignal {
        return this.controller.signal;
    }

    get disposed(): boolean {
        return this.isDisposed;
    }

    interval(handler: () => void, ms: number): TimerHandle {
        const handle = setInterval(handler, ms) as unknown as TimerHandle;
        if (this.isDisposed) {
            clearInterval(handle);
        } else {
            this.intervals.add(handle);
        }
        return handle;
    }

    timeout(handler: () => void, ms: number): TimerHandle {
        const handle = setTimeout(() => {
            this.timeouts.delete(handle);
            handler();
        }, ms) as unknown as TimerHandle;
        if (this.isDisposed) {
            clearTimeout(handle);
        } else {
            this.timeouts.add(handle);
        }
        return handle;
    }

    listen(
        target: EventTarget,
        type: string,
        handler: EventListenerOrEventListenerObject,
        options?: AddEventListenerOptions | boolean,
    ) {
        const base = typeof options === 'boolean' ? {capture: options} : (options ?? {});
        target.addEventListener(type, handler, {...base, signal: this.signal});
        return () => target.removeEventListener(type, handler, base);
    }

    onDispose(fn: () => void) {
        if (this.isDisposed) {
            fn();
            return;
        }
        this.teardowns.push(fn);
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;

        this.intervals.forEach(handle => clearInterval(handle));
        this.intervals.clear();
        this.timeouts.forEach(handle => clearTimeout(handle));
        this.timeouts.clear();
        // Removes every listener and event-bus subscription that took the signal.
        this.controller.abort();
        // Reverse order: a teardown registered later may depend on an earlier one.
        while (this.teardowns.length) {
            this.teardowns.pop()!();
        }
    }
}

export function createRootScope(id: string): ScriptScope {
    return new Scope(id);
}

/**
 * Bind a method to the real client, remembering the result — but re-bind when the
 * property has been reassigned since. Scripts do install functions onto the client
 * (enemyBinds does), so a cache keyed on the name alone would hand back a wrapper
 * around the function that used to be there.
 */
function bindCache() {
    const cache = new Map<PropertyKey, {source: Function; wrapped: Function}>();
    return (prop: PropertyKey, value: Function, target: object, make?: (value: Function) => Function) => {
        const cached = cache.get(prop);
        if (cached && cached.source === value) return cached.wrapped;
        const wrapped = make ? make(value) : value.bind(target);
        cache.set(prop, {source: value, wrapped});
        return wrapped;
    };
}

const REGISTRARS = new Set([
    'registerTrigger',
    'registerMultilineTrigger',
    'registerOneTimeTrigger',
    'registerOneTimeMultilineTrigger',
    'registerTokenTrigger',
]);

/**
 * Triggers registered through this facade are stamped with `owner`, and refused
 * once the scope is gone.
 *
 * The refusal is not belt-and-braces. Five scripts have an `async` init and
 * register only after awaiting a data load — turn one off while that load is in
 * flight and the registration lands after `removeByOwner` has already swept, so
 * the trigger would stay for the rest of the session with no owner left to
 * remove it. Dropping it is the right answer: the script is gone, and work it
 * started before it stopped has nothing left to serve.
 */
function scopedTriggers(triggers: Triggers, owner: string, scope: ScriptScope): Triggers {
    const bind = bindCache();
    return new Proxy(triggers, {
        get(target, prop) {
            const value = Reflect.get(target, prop, target);
            if (typeof value !== 'function') return value;
            if (!REGISTRARS.has(prop as string)) return bind(prop, value, target);
            return bind(prop, value, target, register => (...args: unknown[]) => {
                const trigger = register.apply(target, args);
                trigger.owner = owner;
                if (scope.disposed) {
                    target.removeTrigger(trigger);
                }
                return trigger;
            });
        },
    });
}

/** Aliases pushed through this facade are stamped with `owner`, and dropped once
 * the scope is gone. See scopedTriggers for why a late registration happens. */
function scopedAliases(aliases: AliasList, owner: string, scope: ScriptScope): AliasList {
    const bind = bindCache();
    return new Proxy(aliases, {
        get(target, prop) {
            const value = Reflect.get(target, prop, target);
            if (typeof value !== 'function') return value;
            if (prop !== 'push') return bind(prop, value, target);
            return bind(prop, value, target, () => (...items: AliasEntry[]) => {
                if (scope.disposed) return target.length;
                return target.push(...items.map(item => {
                    item.owner = owner;
                    return item;
                }));
            });
        },
    });
}

/**
 * A `Client` view that attributes everything a script registers to that script.
 *
 * Scripts keep taking a plain `Client` — the attribution rides along on the
 * object they were handed, so it also covers triggers registered later from
 * inside a callback, which a "currently loading script" global could not.
 */
export function createScriptScope(client: Client, id: string): {client: Client; scope: ScriptScope} {
    const scope = new Scope(id);
    const triggers = scopedTriggers(client.Triggers, id, scope);
    const aliases = scopedAliases(client.aliases, id, scope);
    const hookIds = new Set<string>();
    const bind = bindCache();

    scope.onDispose(() => {
        client.Triggers.removeByOwner(id);
        client.aliases.removeByOwner(id);
        hookIds.forEach(hookId => client.unregisterCommandHook(hookId));
        hookIds.clear();
    });

    const overrides: Record<string, unknown> = {
        Triggers: triggers,
        aliases,
        scope,
        registerCommandHook(hookId: string, callback: CommandHookCallback, priority?: number) {
            hookIds.add(hookId);
            client.registerCommandHook(hookId, callback, priority);
        },
        unregisterCommandHook(hookId: string) {
            hookIds.delete(hookId);
            return client.unregisterCommandHook(hookId);
        },
        on(event: never, listener: never, options?: boolean | {once?: boolean; signal?: AbortSignal}) {
            const base = typeof options === 'boolean' ? {once: options} : (options ?? {});
            return client.on(event, listener, {...base, signal: base.signal ?? scope.signal});
        },
    };

    const scoped = new Proxy(client, {
        get(target, prop) {
            if (prop in overrides) return overrides[prop as string];
            const value = Reflect.get(target, prop, target);
            if (typeof value !== 'function') return value;
            return bind(prop, value, target);
        },
        set(target, prop, value) {
            if (prop === 'aliases') {
                // Assigning it would swap the real list out from under every other
                // script; the facade is per-script and must not be replaceable.
                return false;
            }
            return Reflect.set(target, prop, value, target);
        },
    });

    return {client: scoped, scope};
}
