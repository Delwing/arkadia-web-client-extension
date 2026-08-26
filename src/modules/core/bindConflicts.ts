/**
 * Bind conflict detection.
 *
 * `BindSettings` holds a dozen different slots that all listen on the same
 * keyboard. Nothing in the codebase checked whether a newly added bind collides
 * with an existing one, which is tolerable when a human is picking keys in the
 * Binds panel (they can see the whole table) and unacceptable when an AI
 * proposes one from a chat panel.
 *
 * This is deliberately a *warning* mechanism, not a rejection one: rebinding an
 * occupied key is a legitimate thing to want. The assistant card shows the
 * conflict and the user decides.
 *
 * The comparison mirrors `bindMatches` in `keymapTypes.ts`: a bind is identified
 * by its key plus the three modifier flags, with an absent modifier meaning
 * `false`. Key names are compared case-insensitively because the same physical
 * key can be stored either as a `KeyboardEvent.code` (`KeyQ`) or as a bare
 * character (`q`) depending on where it was captured.
 */

import type { Bind, BindSettings, CustomBind, DirectionBinds } from './keymapTypes';

export interface BindConflict {
    /** Dotted path of the occupied slot, e.g. `custom[2]` or `directions.n`. */
    path: string;
    /** Polish, ASCII-only slot name for the confirm card. */
    label: string;
    /** The bind already sitting on that key. */
    bind: Bind;
    /** Command the occupying bind sends, when it has one. */
    command?: string;
}

/** Polish labels for the fixed slots. ASCII only, like every other card string. */
const SLOT_LABELS: Record<string, string> = {
    main: 'Bind glowny',
    mainGates: 'Bind glowny - bramy',
    mainTransport: 'Bind glowny - transport',
    mainLoot: 'Bind glowny - lup',
    lamp: 'Lampa',
    attack: 'Atak',
    support: 'Wsparcie',
    moveMode: 'Tryb ruchu',
    roomBind: 'Bind lokacji',
    drinkable: 'Napoje',
    doubleK: 'Podwojne +k',
};

const DIRECTION_LABELS: Record<keyof DirectionBinds, string> = {
    n: 'Kierunek: polnoc',
    s: 'Kierunek: poludnie',
    w: 'Kierunek: zachod',
    e: 'Kierunek: wschod',
    nw: 'Kierunek: polnocny zachod',
    ne: 'Kierunek: polnocny wschod',
    sw: 'Kierunek: poludniowy zachod',
    se: 'Kierunek: poludniowy wschod',
    u: 'Kierunek: gora',
    d: 'Kierunek: dol',
    zerknij: 'Zerknij',
    special: 'Kierunek specjalny',
};

const ARRAY_LABELS: Record<string, string> = {
    temp: 'Bind tymczasowy',
    enemy: 'Bind wroga',
    enemyBlock: 'Bind blokowania wroga',
    custom: 'Bind wlasny',
};

/** True when two binds would be triggered by the same keystroke. */
export function sameBind(a: Bind | undefined, b: Bind | undefined): boolean {
    if (!a || !b) return false;
    if (!a.key || !b.key) return false;
    if (a.key.toLowerCase() !== b.key.toLowerCase()) return false;
    return (
        Boolean(a.ctrl) === Boolean(b.ctrl)
        && Boolean(a.alt) === Boolean(b.alt)
        && Boolean(a.shift) === Boolean(b.shift)
    );
}

/** Human-readable keystroke, e.g. `Ctrl + Alt + KeyQ`. */
export function describeBind(bind: Bind): string {
    const parts: string[] = [];
    if (bind.ctrl) parts.push('Ctrl');
    if (bind.alt) parts.push('Alt');
    if (bind.shift) parts.push('Shift');
    parts.push(bind.key);
    return parts.join(' + ');
}

/**
 * Every slot in `BindSettings` that would fire on the same keystroke as
 * `candidate`. `skip` lets a caller exclude the slot it is about to overwrite
 * (e.g. when editing `custom[3]` in place).
 */
export function findBindConflicts(
    binds: BindSettings | undefined,
    candidate: Bind,
    skip?: string,
): BindConflict[] {
    if (!binds || !candidate?.key) return [];
    const conflicts: BindConflict[] = [];

    const push = (path: string, label: string, bind: Bind | undefined, command?: string) => {
        if (path === skip) return;
        if (!sameBind(bind, candidate)) return;
        conflicts.push({ path, label, bind: bind as Bind, command });
    };

    for (const slot of Object.keys(SLOT_LABELS)) {
        push(slot, SLOT_LABELS[slot], (binds as unknown as Record<string, Bind | undefined>)[slot]);
    }

    const directions = binds.directions;
    if (directions) {
        for (const dir of Object.keys(DIRECTION_LABELS) as (keyof DirectionBinds)[]) {
            push(`directions.${dir}`, DIRECTION_LABELS[dir], directions[dir]);
        }
    }

    for (const listName of ['temp', 'enemy', 'enemyBlock'] as const) {
        const list = binds[listName];
        if (!Array.isArray(list)) continue;
        list.forEach((bind, index) => {
            push(`${listName}[${index}]`, `${ARRAY_LABELS[listName]} ${index + 1}`, bind);
        });
    }

    if (Array.isArray(binds.custom)) {
        binds.custom.forEach((bind: CustomBind, index) => {
            push(`custom[${index}]`, `${ARRAY_LABELS.custom} ${index + 1}`, bind, bind?.command);
        });
    }

    return conflicts;
}
