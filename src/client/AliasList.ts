export interface AliasEntry {
    pattern: RegExp;
    callback: Function;
    /**
     * Registry id of the script that pushed this alias, stamped by its
     * ScriptScope so the alias can be withdrawn when the script is turned off.
     */
    owner?: string;
}

function requiresSlash(pattern: RegExp): boolean {
    const src = pattern.source;
    const i = src.startsWith('^') ? 1 : 0;
    return src[i] === '\\' && src[i + 1] === '/' && src[i + 2] !== '?';
}

export class AliasList extends Array<AliasEntry> {
    private readonly _slash: AliasEntry[] = [];
    private readonly _other: AliasEntry[] = [];

    push(...items: AliasEntry[]): number {
        for (const item of items) {
            (requiresSlash(item.pattern) ? this._slash : this._other).push(item);
        }
        return super.push(...items);
    }

    splice(start: number, deleteCount?: number, ...insert: AliasEntry[]): AliasEntry[] {
        const removed = deleteCount !== undefined
            ? super.splice(start, deleteCount, ...insert)
            : super.splice(start);
        for (const item of removed) {
            const bucket = requiresSlash(item.pattern) ? this._slash : this._other;
            const idx = bucket.indexOf(item);
            if (idx !== -1) bucket.splice(idx, 1);
        }
        return removed;
    }

    /** Withdraw every alias a given script pushed. Returns how many went. */
    removeByOwner(owner: string): number {
        let removed = 0;
        // Backwards: splice() keeps the slash/other buckets in step, so removing
        // from the tail keeps the indices ahead of us valid.
        for (let i = this.length - 1; i >= 0; i--) {
            if (this[i].owner === owner) {
                this.splice(i, 1);
                removed++;
            }
        }
        return removed;
    }

    forCommand(command: string): AliasEntry[] {
        return command.startsWith('/') ? this._slash : this._other;
    }
}
