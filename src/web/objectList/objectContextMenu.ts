import { Crosshair, Eye, ListPlus, Pencil, Scale, Shield, Swords, Terminal, UserPlus } from "lucide-react";
import type { ContextMenuEntry, ContextMenuIcon, ContextMenuOptions } from "@web/contextMenu";
import { openSettingsPage } from "@web/settings/categories.ts";

/** An icon for the verbs players put in the menu; anything else is a command. */
const VERB_ICONS: [RegExp, ContextMenuIcon][] = [
    [/^zabij\b/, Swords],
    [/^wska/, Crosshair],
    [/^zaslo/, Shield],
    [/^(ob|obejrzyj)\b/, Eye],
    [/^ocen/, Scale],
    [/^zapros/, UserPlus],
];

function verbIcon(command: string): ContextMenuIcon {
    const verb = command.trim().toLowerCase();
    return VERB_ICONS.find(([pattern]) => pattern.test(verb))?.[1] ?? Terminal;
}

export interface ObjectMenuTarget {
    id: string;
    /** "zielonoskory goblin", when the object list knows it. */
    desc?: string;
    teammate?: boolean;
}

/**
 * The object list's right-click menu: the player's commands aimed at the
 * object, then queueing it for an attack and editing the commands.
 */
export function buildObjectContextMenu(
    target: ObjectMenuTarget,
    commands: string[],
    send: (command: string) => void,
): { items: ContextMenuEntry[]; options: ContextMenuOptions } {
    const items: ContextMenuEntry[] = commands.map((command) => ({
        label: command,
        icon: verbIcon(command),
        action: () => send(`${command} ob_${target.id}`),
    }));
    if (!target.teammate) {
        items.push({
            label: "Dodaj do kolejki ataku",
            icon: ListPlus,
            separator: true,
            action: () => send(`/q ob_${target.id}`),
        });
    }
    items.push({
        label: "Edytuj te komendy",
        icon: Pencil,
        separator: target.teammate,
        opensWindow: true,
        action: () => openSettingsPage("ui-windows", "ui-object-context-menu-container"),
    });
    const meta = target.teammate ? `ob_${target.id} · drużyna` : `ob_${target.id}`;
    return {
        items,
        options: target.desc
            ? { header: target.desc, headerMeta: meta, smallHeader: true, width: 260 }
            : { header: meta, smallHeader: true, width: 260 },
    };
}
