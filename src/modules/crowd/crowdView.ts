/**
 * The player's own zlom list and odmiany, completed from the crowd list.
 *
 * A view, never written back (see crowdSnapshot.ts for why): the player's
 * entries stay as they are, with blanks filled from the crowd entry of the same
 * name, and items they never evaluated join as read-only crowd entries. Weight,
 * price and quality ratings are never invented - a crowd entry has them at 0,
 * and is marked so nothing mistakes it for the player's own.
 *
 * Without a crowd list (the player does not share, or nothing arrived yet) the
 * view is just the player's own lists.
 */

import {
    getZlomSnapshot,
    subscribeZlom,
    type ArmorEntry,
    type ShieldEntry,
    type WeaponEntry,
    type ZlomSnapshot,
} from '@modules/data/zlomStore';
import { getOdmiana, getOdmianaSnapshot, subscribeOdmiana, type OdmianaSnapshot } from '@modules/data/odmianaStore';
import {
    getCrowdSnapshot,
    subscribeCrowdSnapshot,
    type CrowdArmour,
    type CrowdShield,
    type CrowdSnapshot,
    type CrowdWeapon,
} from './crowdSnapshot';

/** How an entry of the view came to be */
export interface CrowdMarks {
    /** Not in the player's list: known only from other players */
    fromCrowd?: true;
    /** The player's own entry, with these fields filled from other players */
    crowdFilled?: string[];
    /** For a crowd entry: how many players agree on it */
    confirmations?: number;
}

export type ViewWeapon = WeaponEntry & CrowdMarks;
export type ViewArmour = ArmorEntry & CrowdMarks;
export type ViewShield = ShieldEntry & CrowdMarks;

export interface ZlomView extends ZlomSnapshot {
    bronie: ViewWeapon[];
    zbroje: ViewArmour[];
    tarcze: ViewShield[];
}

const key = (name: string) => name.trim().toLowerCase();
const blank = (value: unknown) => typeof value !== 'string' || !value.trim();
const bit = (value: number): 0 | 1 => (value ? 1 : 0);

/** Fill the blank text fields of `own` from `crowd`, noting which were filled */
function fill<T extends object>(own: T, crowd: Record<string, unknown>, fields: string[]): T & CrowdMarks {
    const filled: string[] = [];
    const next = { ...own } as Record<string, unknown>;
    for (const field of fields) {
        if (blank(next[field]) && !blank(crowd[field])) {
            next[field] = crowd[field];
            filled.push(field);
        }
    }
    return filled.length ? { ...(next as T), crowdFilled: filled } : own;
}

function mergeWeapons(own: WeaponEntry[], crowd: CrowdWeapon[]): ViewWeapon[] {
    const byName = new Map(crowd.map(c => [key(c.short), c]));
    const result: ViewWeapon[] = own.map(entry => {
        const match = byName.get(key(entry.short));
        if (!match) return entry;
        const filled = fill(entry, match as unknown as Record<string, unknown>, ['shortAlt', 'typ', 'rodzaj', 'chwyt']);
        // No damage type at all is a gap, not a fact: no weapon deals none
        if (!entry.klute && !entry.obuch && !entry.ciete && (match.klute || match.obuch || match.ciete)) {
            return {
                ...filled,
                klute: match.klute,
                obuch: match.obuch,
                ciete: match.ciete,
                crowdFilled: [...(filled.crowdFilled ?? []), 'obrazenia'],
            };
        }
        return filled;
    });
    const ownNames = new Set(own.map(e => key(e.short)));
    for (const c of crowd) {
        if (ownNames.has(key(c.short))) continue;
        result.push({
            short: c.short, shortAlt: c.shortAlt, typ: c.typ, rodzaj: c.rodzaj,
            klute: c.klute, obuch: c.obuch, ciete: c.ciete, chwyt: c.chwyt,
            magik: bit(c.magik), srebro: bit(c.srebro), opis: c.opis,
            waga: 0, obj: 0, cena: 0, wywazenie: 0, parowanie: 0, roomId: null,
            fromCrowd: true, confirmations: c.confirmations,
        });
    }
    return result;
}

function mergeArmour(own: ArmorEntry[], crowd: CrowdArmour[]): ViewArmour[] {
    const byName = new Map(crowd.map(c => [key(c.short), c]));
    const result: ViewArmour[] = own.map(entry => {
        const match = byName.get(key(entry.short));
        return match ? fill(entry, match as unknown as Record<string, unknown>, ['shortAlt', 'typ', 'oslona', 'iLine']) : entry;
    });
    const ownNames = new Set(own.map(e => key(e.short)));
    for (const c of crowd) {
        if (ownNames.has(key(c.short))) continue;
        result.push({
            short: c.short, shortAlt: c.shortAlt, typ: c.typ, klute: 0, obuch: 0, ciete: 0,
            magik: bit(c.magik), opis: c.opis, waga: 0, obj: 0, cena: 0, oslona: c.oslona, roomId: null,
            ...(c.iLine ? { iLine: c.iLine } : {}),
            fromCrowd: true, confirmations: c.confirmations,
        });
    }
    return result;
}

function mergeShields(own: ShieldEntry[], crowd: CrowdShield[]): ViewShield[] {
    const byName = new Map(crowd.map(c => [key(c.short), c]));
    const result: ViewShield[] = own.map(entry => {
        const match = byName.get(key(entry.short));
        return match ? fill(entry, match as unknown as Record<string, unknown>, ['shortAlt', 'oslona', 'iLine']) : entry;
    });
    const ownNames = new Set(own.map(e => key(e.short)));
    for (const c of crowd) {
        if (ownNames.has(key(c.short))) continue;
        result.push({
            short: c.short, shortAlt: c.shortAlt, klute: 0, obuch: 0, ciete: 0,
            magik: bit(c.magik), opis: c.opis, waga: 0, obj: 0, cena: 0, parowanie: 0, oslona: c.oslona, roomId: null,
            ...(c.iLine ? { iLine: c.iLine } : {}),
            fromCrowd: true, confirmations: c.confirmations,
        });
    }
    return result;
}

/** The player's list completed from the crowd list; just the player's list without one */
export function buildZlomView(own: ZlomSnapshot, crowd: CrowdSnapshot | null): ZlomView {
    if (!crowd) return own;
    return {
        bronie: mergeWeapons(own.bronie, crowd.bronie),
        zbroje: mergeArmour(own.zbroje, crowd.zbroje),
        tarcze: mergeShields(own.tarcze, crowd.tarcze),
    };
}

/** Declensions the player saw, plus the crowd's for names they have not */
export function buildKnownOdmiany(own: OdmianaSnapshot, crowd: CrowdSnapshot | null): OdmianaSnapshot {
    if (!crowd?.odmiany.length) return own;
    const known: OdmianaSnapshot = {};
    for (const o of crowd.odmiany) {
        const name = key(o.mianownik);
        known[name] = {
            mianownik: name, dopelniacz: o.dopelniacz, celownik: o.celownik,
            biernik: o.biernik, narzednik: o.narzednik, miejscownik: o.miejscownik,
        };
    }
    return { ...known, ...own };
}

let zlomView: ZlomView | null = null;
let odmianyView: OdmianaSnapshot | null = null;
const zlomListeners = new Set<(view: ZlomView) => void>();
const odmianaListeners = new Set<(view: OdmianaSnapshot) => void>();

function zlomChanged() {
    zlomView = null;
    const view = getZlomView();
    for (const listener of zlomListeners) listener(view);
}

function odmianyChanged() {
    odmianyView = null;
    const view = getKnownOdmiany();
    for (const listener of odmianaListeners) listener(view);
}

subscribeZlom(zlomChanged);
subscribeOdmiana(odmianyChanged);
subscribeCrowdSnapshot(() => {
    zlomChanged();
    odmianyChanged();
});

// The inputs each view was built from: a different object means a different list.
// Checked on every read rather than trusted to a change event, which a store reset drops.
let zlomInputs: [ZlomSnapshot, CrowdSnapshot | null] | null = null;
let odmianaInputs: [OdmianaSnapshot, CrowdSnapshot | null] | null = null;

export function getZlomView(): ZlomView {
    const own = getZlomSnapshot();
    const crowd = getCrowdSnapshot();
    if (!zlomView || zlomInputs?.[0] !== own || zlomInputs[1] !== crowd) {
        zlomView = buildZlomView(own, crowd);
        zlomInputs = [own, crowd];
    }
    return zlomView;
}

export function subscribeZlomView(listener: (view: ZlomView) => void): () => void {
    zlomListeners.add(listener);
    return () => zlomListeners.delete(listener);
}

export function getKnownOdmiany(): OdmianaSnapshot {
    const own = getOdmianaSnapshot();
    const crowd = getCrowdSnapshot();
    if (!odmianyView || odmianaInputs?.[0] !== own || odmianaInputs[1] !== crowd) {
        odmianyView = buildKnownOdmiany(own, crowd);
        odmianaInputs = [own, crowd];
    }
    return odmianyView;
}

export function subscribeKnownOdmiany(listener: (view: OdmianaSnapshot) => void): () => void {
    odmianaListeners.add(listener);
    return () => odmianaListeners.delete(listener);
}

/** Whether anyone - this player or another - has seen this name declined */
export function isDeclined(name: string): boolean {
    return !!getOdmiana(name) || !!getKnownOdmiany()[key(name)];
}

export type ZlomGroup = 'bronie' | 'zbroje' | 'tarcze';

/**
 * What an entry still lacks, as "brak ..." words: what a player carrying it
 * could fill in, by declining its name (odmien) or evaluating it (ocen).
 * Optional fields - the i line, the name evaluating gives - never count.
 * Mirrors the gaps the public spis zlomu page shows.
 */
export function entryGaps(group: ZlomGroup, entry: ViewWeapon | ViewArmour | ViewShield, odmiany: OdmianaSnapshot): string[] {
    const gaps: string[] = [];
    if (!odmiany[key(entry.short)]) gaps.push('odmiany');
    if (group === 'bronie') {
        const w = entry as ViewWeapon;
        if (blank(w.typ)) gaps.push('typu');
        if (blank(w.rodzaj)) gaps.push('rodzaju');
        if (blank(w.chwyt)) gaps.push('chwytu');
        if (!w.klute && !w.obuch && !w.ciete) gaps.push('obrażeń');
    } else {
        if (group === 'zbroje' && blank((entry as ViewArmour).typ)) gaps.push('typu');
        if (blank((entry as ViewArmour | ViewShield).oslona)) gaps.push('osłony');
    }
    return gaps;
}
