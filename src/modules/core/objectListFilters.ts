/**
 * Object List Entry Filter System
 *
 * This module provides a plugin system for customizing the rendering of object list entries.
 * You can register filters to modify colors, descriptions, HP bars, and other aspects of entries.
 *
 * Lives in `@modules/core` (UI-neutral) so both the plugin API (`src/client`) and the web
 * object-list renderer (`src/web`) can share the single registry without a cross-layer import.
 */

export interface ObjectData {
    num: number;
    id?: string;
    desc?: string;
    hp?: number;
    maxhp?: number;
    image?: string;
    attackers?: { num: number; id?: string }[];
}

export interface EntryContext {
    /** The object data from GMCP */
    object: ObjectData;
    /** The display number/shortcut for this entry */
    displayNum: number;
    /** Whether this is the avatar's current target */
    isTarget: boolean;
    /** Whether this is the avatar's next target in queue */
    isNextTarget: boolean;
    /** Whether this object is a team member */
    isTeammate: boolean;
    /** The raw description text */
    rawDescription: string;
    /** Whether this object is currently attacking */
    isAttacking: boolean;
    /** Current attack command being used */
    attackCommand: string;
}

export interface EntryStyle {
    /** Color for the description text (CSS color value) */
    descriptionColor?: string;
    /** Background color for the description text (CSS color value) */
    descriptionBackgroundColor?: string;
    /** Whether to apply italic style to description */
    italic?: boolean;
    /** Color for the HP bar (CSS color value) */
    hpBarColor?: string;
    /** Additional CSS class names to add to the entry */
    cssClasses?: string[];
    /** Custom prefix to add before the entry (e.g., icons, indicators) */
    prefix?: string;
    /** Custom suffix to add after the entry */
    suffix?: string;
}

export interface EntryContent {
    /** Modified description text (replaces original if provided) */
    description?: string;
    /** Modified HP display (replaces original if provided) */
    hpBar?: string;
    /** Modified number label (replaces original if provided) */
    numberLabel?: string;
}

export interface FilterResult {
    /** Style modifications - mutate this object to add/change styles */
    style: EntryStyle;
    /** Content modifications - mutate this object to replace content */
    content: EntryContent;
    /** If true, prevents subsequent filters from running */
    stopPropagation?: boolean;
}

/**
 * Filter function type
 *
 * Receives context about the entry and the current accumulated result from previous filters.
 * Filters can modify the result object directly or return it (with stopPropagation if needed).
 *
 * The result parameter contains accumulated style and content from all previous filters,
 * allowing you to:
 * - Check what other filters have already done
 * - Build upon previous modifications (e.g., append to prefix/suffix)
 * - Conditionally apply changes based on what's already set
 *
 * You can either:
 * - Mutate the result object and return nothing (void)
 * - Mutate and return the result with stopPropagation: true to prevent further filters
 * - Return nothing to continue without changes
 *
 * @param context Information about the object being rendered
 * @param result Current accumulated style and content (mutate this object)
 */
export type ObjectListEntryFilter = (context: EntryContext, result: FilterResult) => void | { stopPropagation: true };

/**
 * Registry for object list entry filters
 */
class ObjectListFilterRegistry {
    private filters: Map<string, ObjectListEntryFilter> = new Map();
    private filterOrder: string[] = [];

    /**
     * Register a new filter
     *
     * @param name Unique identifier for the filter
     * @param filter The filter function
     * @param priority Optional priority (higher = runs first). Default: 0
     */
    register(name: string, filter: ObjectListEntryFilter, priority = 0): void {
        this.filters.set(name, filter);

        // Insert based on priority
        const index = this.filterOrder.findIndex(n => {
            const existingPriority = (this.filters.get(n) as any)._priority ?? 0;
            return priority > existingPriority;
        });

        // Store priority on function for later reference
        (filter as any)._priority = priority;

        if (index === -1) {
            this.filterOrder.push(name);
        } else {
            this.filterOrder.splice(index, 0, name);
        }
    }

    /**
     * Unregister a filter
     *
     * @param name The filter identifier to remove
     */
    unregister(name: string): boolean {
        const index = this.filterOrder.indexOf(name);
        if (index !== -1) {
            this.filterOrder.splice(index, 1);
            return this.filters.delete(name);
        }
        return false;
    }

    /**
     * Apply all registered filters to an entry
     *
     * @param context The entry context
     * @returns Accumulated filter results
     */
    apply(context: EntryContext): FilterResult {
        const result: FilterResult = {
            style: {},
            content: {}
        };

        for (const name of this.filterOrder) {
            const filter = this.filters.get(name);
            if (!filter) continue;

            try {
                const filterReturn = filter(context, result);

                // Stop if requested
                if (filterReturn && 'stopPropagation' in filterReturn && filterReturn.stopPropagation) {
                    break;
                }
            } catch (error) {
                console.error(`Error in object list filter '${name}':`, error);
            }
        }

        return result;
    }

    /**
     * Clear all registered filters
     */
    clear(): void {
        this.filters.clear();
        this.filterOrder = [];
    }

    /**
     * Get list of registered filter names
     */
    getFilterNames(): string[] {
        return [...this.filterOrder];
    }
}

// Singleton instance
export const objectListFilters = new ObjectListFilterRegistry();
