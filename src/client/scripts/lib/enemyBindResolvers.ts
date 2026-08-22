/**
 * Enemy Bind Resolver System
 *
 * This module provides a plugin system for customizing which enemies get assigned
 * to the enemy bind slots (F1/F2/F3) and in what order.
 *
 * The enemy binds feature scans objects on the current location, builds a list of
 * candidates that match the built-in `isEnemy()` check, and fills the bind slots
 * in order. Registered resolvers run as a pipeline on that candidate list before
 * slot assignment, letting plugins:
 *   - reorder candidates (target priority), and
 *   - inject enemies that the built-in check would otherwise miss.
 */

/** A single enemy candidate eligible for a bind slot. */
export interface EnemyBindCandidate {
    /** Object number (matches the GMCP object id; bind with `ob_<num>`). */
    num: number;
    /** Object description/name as shown in the bind line. */
    desc: string;
}

/** Read-only view of an object on the current location, passed to resolvers. */
export interface EnemyBindLocationObject {
    num: number;
    desc?: string;
    hp?: number;
    attack_num?: boolean | number;
    shortcut?: string;
    __category?: 'player' | 'team' | 'rest' | 'rest-noncombat';
}

/**
 * Resolver function type.
 *
 * Receives the current (ordered) candidate list and every object on the location,
 * and returns the candidate list to use going forward. Return a reordered and/or
 * extended array to change which enemies get bound. Return the input unchanged (or
 * `void`) to leave it as-is.
 *
 * Resolvers compose: the output of one becomes the `candidates` input of the next,
 * in priority order (higher priority runs first).
 *
 * @param candidates Current ordered candidate list (output of previous resolvers)
 * @param allObjects Every object on the current location
 */
export type EnemyBindResolver = (
    candidates: EnemyBindCandidate[],
    allObjects: EnemyBindLocationObject[],
) => EnemyBindCandidate[] | void;

interface RegisteredResolver {
    name: string;
    resolver: EnemyBindResolver;
    priority: number;
}

/**
 * Registry for enemy bind resolvers.
 */
class EnemyBindResolverRegistry {
    private resolvers: RegisteredResolver[] = [];

    /**
     * Register a resolver.
     *
     * @param name Unique identifier (re-registering the same name replaces it)
     * @param resolver The resolver function
     * @param priority Optional priority (higher = runs first). Default: 0
     */
    register(name: string, resolver: EnemyBindResolver, priority = 0): void {
        this.unregister(name);
        this.resolvers.push({ name, resolver, priority });
        // Highest priority first; stable for equal priorities (registration order).
        this.resolvers.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Unregister a resolver.
     *
     * @param name The resolver identifier to remove
     * @returns True if a resolver was found and removed
     */
    unregister(name: string): boolean {
        const index = this.resolvers.findIndex(r => r.name === name);
        if (index === -1) {
            return false;
        }
        this.resolvers.splice(index, 1);
        return true;
    }

    /**
     * Run all registered resolvers as a pipeline over the candidate list.
     *
     * A resolver that throws is skipped and the previous candidate list is kept.
     * The returned list is sanitized: duplicate `num`s are dropped (first wins) and
     * entries without a valid `num` are removed.
     *
     * @param candidates Initial ordered candidate list
     * @param allObjects Every object on the current location
     * @returns The resolved candidate list
     */
    apply(
        candidates: EnemyBindCandidate[],
        allObjects: EnemyBindLocationObject[],
    ): EnemyBindCandidate[] {
        let current = candidates;

        for (const { name, resolver } of this.resolvers) {
            try {
                const next = resolver(current, allObjects);
                if (Array.isArray(next)) {
                    current = next;
                }
            } catch (error) {
                console.error(`Error in enemy bind resolver '${name}':`, error);
            }
        }

        const seen = new Set<number>();
        const sanitized: EnemyBindCandidate[] = [];
        for (const candidate of current) {
            if (!candidate || typeof candidate.num !== 'number' || seen.has(candidate.num)) {
                continue;
            }
            seen.add(candidate.num);
            sanitized.push({ num: candidate.num, desc: candidate.desc });
        }
        return sanitized;
    }

    /**
     * Get list of registered resolver names in priority order.
     */
    getResolverNames(): string[] {
        return this.resolvers.map(r => r.name);
    }

    /**
     * Clear all registered resolvers.
     */
    clear(): void {
        this.resolvers = [];
    }
}

// Singleton instance
export const enemyBindResolvers = new EnemyBindResolverRegistry();
