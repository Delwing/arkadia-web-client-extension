export interface AliasEntry {
    pattern: RegExp;
    callback: Function;
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

    forCommand(command: string): AliasEntry[] {
        return command.startsWith('/') ? this._slash : this._other;
    }
}
