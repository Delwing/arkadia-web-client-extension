import Client from "../Client";
import { AnsiAwareBuffer } from "../ansi/FormatState";
import eventBus from "@modules/core/eventBus";
import { resolveDuplicateToMain } from "./duplicateToMain";

const HISTORY_LIMIT = 200;

export type CombatMessageType = "combat.avatar" | "combat.team" | "combat.others";

/** "hp" is a condition line ("Jest lekko ranny.") captured by the "Kondycje" toggle. */
export type CombatEntryType = CombatMessageType | "hp";

export type CombatEntry = {
    buffer: AnsiAwareBuffer;
    type: CombatEntryType;
    /** The line is also shown (and so logged) in the main window. */
    alsoInMain?: boolean;
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

// Condition lines ("Kondycje", as in Mudlet). By default they are copied and
// stay in the main window too; with conditionsToMain off they are moved.
let captureConditions = false;
let conditionsToMain = true;

export function setCombatConditionCapture(enabled: boolean): void {
    captureConditions = enabled;
}

export function setCombatConditionsToMain(enabled: boolean): void {
    conditionsToMain = enabled;
}

// Someone's (or your own) condition, from `kondycja`, `ob` and the like:
// "Jestes w swietnej kondycji.", "Goblin jest ciezko ranny.", "Jest ledwo zywa."
const CONDITION_PATTERN = /(?:^|\s)[Jj]est(?:es)? (?:ledwo zyw[ya]|ciezko rann[ya]|w zlej kondycji|lekko rann[ya]|rann[ya]|w dobrym stanie|w swietnej kondycji)\b/;

export function isConditionLine(text: string): boolean {
    return !text.startsWith("Wyglada") && CONDITION_PATTERN.test(text);
}

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

const LOOK_COMMANDS = new Set(["zerknij", "spojrz", "sp"]);

const combatTypes: CombatMessageType[] =["combat.avatar", "combat.team", "combat.others"];

function isCombatType(type: string): type is CombatMessageType {
    return combatTypes.includes(type as CombatMessageType);
}

export default function initCombatWindow(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    function addEntry(buffer: AnsiAwareBuffer, type: CombatEntryType, alsoInMain = false) {
        const entry: CombatEntry = {
            buffer: buffer.clone(),
            type,
            ...(alsoInMain ? { alsoInMain } : {}),
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
        (line: AnsiAwareBuffer, _matches: RegExpMatchArray, type: string, originalText: string) => {
            if (!isCombatType(type)) return line;

            // Add to combat history
            addEntry(line, type);

            // Messages too important to hide behind the popup get a copy echoed
            // into the main window; the redirect below is unaffected.
            const duplicate = resolveDuplicateToMain(line, type, originalText);
            if (duplicate) client.print(duplicate);

            // Mark as deleted to prevent showing in main window
            return line.markAsDeleted();
        },
        "combatWindow"
    );

    // Condition lines: always go to the window; stay in main unless conditionsToMain is off.
    client.Triggers.registerTrigger(
        (line: AnsiAwareBuffer, _matches: RegExpMatchArray, type: string) => {
            if (!captureConditions || isCombatType(type)) return undefined;
            return isConditionLine(line.text.trim()) ? [] as unknown as RegExpMatchArray : undefined;
        },
        (line: AnsiAwareBuffer) => {
            addEntry(line, "hp", conditionsToMain);
            return conditionsToMain ? line : line.markAsDeleted();
        },
        "combatWindow"
    );

    client.on("client.disconnect", () => {
        combatHistory = [];
        eventBus.emit("combat.cleared");
    });

    // Looking around sends room info too, without moving (as Mudlet's scripts.last_send check).
    let lastCommand = "";
    client.on("command", (command = "") => {
        lastCommand = command.trim().toLowerCase();
    });

    // Add separator on location change, but only if there are combat messages since last separator
    client.on("gmcp.room.info", () => {
        if (LOOK_COMMANDS.has(lastCommand)) return;
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
