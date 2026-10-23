import Client from "../Client";
import eventBus from "@modules/core/eventBus";
import { getBehaviorSettings, onBehaviorSettingsChange } from "@modules/core/settings";
import type { OdmianaSnapshot } from "@modules/data/odmianaStore";
import {
    entryGaps,
    getKnownOdmiany,
    getZlomView,
    subscribeKnownOdmiany,
    subscribeZlomView,
    type ViewArmour,
    type ViewShield,
    type ViewWeapon,
    type ViewWearable,
    type ZlomGroup,
    type ZlomView,
} from "@modules/crowd/crowdView";
import { getInventoryState } from "./inventory";
import { sameItem } from "./armor";

const TAG = "crowd-gap-hint";
const COMBAT_LINE_TYPES = new Set(["combat.avatar", "combat.team", "combat.others"]);
const CASES = ["mianownik", "dopelniacz", "celownik", "biernik", "narzednik", "miejscownik"] as const;

export interface CarriedGap {
    /** The złom name, nominative: what odmien and ocen take */
    short: string;
    /** Every form it may appear in: as `i` lists it, its names, its known cases */
    names: string[];
    /** What it lacks, as "brak ..." words */
    gaps: string[];
}

/**
 * The carried items the shared list knows but cannot say everything about.
 * Only złom pieces count: a lamp or coins are no gap, since nobody evaluates
 * them into the list.
 */
export function carriedGaps(carried: string[], view: ZlomView, odmiany: OdmianaSnapshot): CarriedGap[] {
    const groups: [ZlomGroup, (ViewWeapon | ViewArmour | ViewShield | ViewWearable)[]][] = [
        ["bronie", view.bronie],
        ["zbroje", view.zbroje],
        ["tarcze", view.tarcze],
        ["ubrania", view.ubrania],
        ["dodatki", view.dodatki],
    ];
    const found = new Map<string, CarriedGap>();
    for (const name of carried) {
        for (const [group, entries] of groups) {
            const entry = entries.find(e => sameItem(e.short, name) || (e.shortAlt && sameItem(e.shortAlt, name)));
            if (!entry) continue;
            const gaps = entryGaps(group, entry, odmiany);
            if (gaps.length) {
                const short = entry.short.toLowerCase();
                const odmiana = odmiany[short];
                const names = new Set([
                    ...(found.get(short)?.names ?? []),
                    name, entry.short, entry.shortAlt ?? "",
                    ...(odmiana ? CASES.map(c => odmiana[c]) : []),
                ].filter(Boolean).map(n => n.toLowerCase()));
                found.set(short, { short, names: [...names], gaps });
            }
            break;
        }
    }
    return [...found.values()];
}

function hintTitle(hint: CarriedGap): string {
    const commands = [
        hint.gaps.includes("odmiany") ? `odmien ${hint.short}` : "",
        hint.gaps.some(g => g !== "odmiany") ? `ocen ${hint.short}` : "",
    ].filter(Boolean);
    return `We wspólnym spisie brak ${hint.gaps.join(", ")}. Uzupełnisz: ${commands.join(", ")}`;
}

/**
 * For a player who shares with the crowd list: the names of carried pieces the
 * list cannot say everything about are underlined wherever the game mentions
 * them, with what is missing and the command that fills it in the tooltip.
 * Never a click: item names already carry other links (loot, context menus).
 */
export default function initCrowdHints(client: Client): () => void {
    const install = () => {
        client.Triggers.removeByTag(TAG);
        if (!getBehaviorSettings().crowdContribute) return;
        const carried = getInventoryState().sections.flatMap(section => section.entries.map(entry => entry.name));
        for (const hint of carriedGaps(carried, getZlomView(), getKnownOdmiany())) {
            const title = hintTitle(hint);
            for (const name of hint.names) {
                client.Triggers.registerTokenTrigger(
                    name,
                    (line, _matches, type) => {
                        if (COMBAT_LINE_TYPES.has(type)) return line;
                        const idx = line.text.toLowerCase().indexOf(name);
                        if (idx === -1) return line;
                        const range: [number, number] = [idx, idx + name.length];
                        line.applyFormat(range, { underline: true });
                        line.createLink(range, { title });
                        return line;
                    },
                    TAG,
                    { caseInsensitive: true },
                );
            }
        }
    };

    install();
    const unsubscribers = [
        eventBus.on("inventory.updated", install),
        subscribeZlomView(install),
        subscribeKnownOdmiany(install),
        onBehaviorSettingsChange(install),
    ];
    return () => {
        unsubscribers.forEach(unsubscribe => unsubscribe());
        client.Triggers.removeByTag(TAG);
    };
}
