import Client from "../Client";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import eventBus from "@modules/core/eventBus";

const HISTORY_LIMIT = 200;

export type CombatMessageType = "combat.avatar" | "combat.team" | "combat.others";

export type CombatEntry = {
    buffer: AnsiAwareBuffer;
    type: CombatMessageType;
} | {
    type: "separator";
};

// Exported history for use by CombatPopup
let combatHistory: CombatEntry[] = [];

// Current filter settings - which types should be redirected to combat window
const redirectSettings: Record<CombatMessageType, boolean> = {
    "combat.avatar": false,
    "combat.team": false,
    "combat.others": false,
};

export function getCombatHistory(): CombatEntry[] {
    return combatHistory;
}

export function getCombatRedirectSettings(): Record<CombatMessageType, boolean> {
    return { ...redirectSettings };
}

export function setCombatRedirectSetting(type: CombatMessageType, enabled: boolean): void {
    redirectSettings[type] = enabled;
    eventBus.emit("combat.settingsChanged", { ...redirectSettings });
}

const combatTypes: CombatMessageType[] = ["combat.avatar", "combat.team", "combat.others"];

function isCombatType(type: string): type is CombatMessageType {
    return combatTypes.includes(type as CombatMessageType);
}

export default function initCombatWindow(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    function addEntry(buffer: AnsiAwareBuffer, type: CombatMessageType) {
        const entry: CombatEntry = {
            buffer: buffer.clone(),
            type,
        };
        combatHistory.push(entry);
        if (combatHistory.length > HISTORY_LIMIT) {
            combatHistory.shift();
        }
        // Notify popup of new message
        eventBus.emit("combat.newMessage", entry);
    }

    // Register a trigger that intercepts all combat messages
    client.Triggers.registerTrigger(
        (_line: AnsiAwareBuffer, _matches: RegExpMatchArray, type: string) => {
            if (!isCombatType(type)) return undefined;
            // Only intercept if redirection is enabled for this type
            if (!redirectSettings[type]) return undefined;
            // Return empty matches to indicate we matched
            return [] as unknown as RegExpMatchArray;
        },
        (line: AnsiAwareBuffer, _matches: RegExpMatchArray, type: string) => {
            if (!isCombatType(type)) return line;

            // Add to combat history
            addEntry(line, type);

            // Mark as deleted to prevent showing in main window
            return line.markAsDeleted();
        },
        "combatWindow",
        // This routes a line to another window rather than hiding it, so it must
        // not fire for a line the gags already suppressed: "delete this" has to
        // keep meaning gone everywhere, the combat window included.
        {skipDeleted: true}
    );

    client.on("client.disconnect", () => {
        combatHistory = [];
        eventBus.emit("combat.cleared");
    });

    // Add separator on location change, but only if there are combat messages since last separator
    client.on("gmcp.room.info", () => {
        // Only add separator if:
        // 1. There are entries in history
        // 2. The last entry is not already a separator
        if (combatHistory.length > 0 && combatHistory[combatHistory.length - 1].type !== "separator") {
            const separator: CombatEntry = { type: "separator" };
            combatHistory.push(separator);
            if (combatHistory.length > HISTORY_LIMIT) {
                combatHistory.shift();
            }
            eventBus.emit("combat.newMessage", separator);
        }
    });

    function openPopup() {
        eventBus.emit("combat.popup.open");
    }

    // "Postawa" combat-readiness popup (weapon / cover / guard / order status).
    // Distinct from the combat message log above.
    function openStatusPopup() {
        eventBus.emit("combatStatus.popup.open");
    }

    if (aliases) {
        aliases.push({ pattern: /^\/walka okno$/, callback: openPopup });
        aliases.push({ pattern: /^\/walkaw$/, callback: openPopup });
        aliases.push({ pattern: /^\/postawa okno$/, callback: openStatusPopup });
        aliases.push({ pattern: /^\/postawaw$/, callback: openStatusPopup });
    }
}
