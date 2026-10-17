/**
 * Biblioteka: ready-made automations a player adds with one click, for what
 * people ask for most often. Each recipe is a small pack, added through
 * `importPack`, so it lands in the player's own list as ordinary elements they
 * can change or delete.
 */
import type { UserAlias } from "@client/scripts/userAliases";
import type { UserTrigger } from "@client/scripts/userTriggers";
import type { UserScript } from "@client/scripts/userScripts";
import { PACK_FORMAT, loadItems, triggerShape, type AutomationItem, type AutomationPack } from "./automationModel";

export interface LibraryRecipe {
    id: string;
    title: string;
    description: string;
    category: string;
    /** The automation group the recipe is added to, created when missing. */
    group: string;
    aliases?: UserAlias[];
    triggers?: UserTrigger[];
    scripts?: UserScript[];
}

export const LIBRARY: LibraryRecipe[] = [
    {
        id: "mail-unreceived-sound",
        title: "Dźwięk na nieodebraną pocztę",
        description: "Gra dźwięk, gdy serwer zgłosi, że na poczcie czeka list do odebrania.",
        category: "Dźwięki",
        group: "Dźwięki",
        triggers: [{
            name: "Dźwięk na nieodebraną pocztę",
            type: "event",
            event: "gmcp.mail.state",
            conditions: [{ arg: "unreceived", op: "eq", value: "true" }],
            macros: [{ type: "beep", soundKey: "beep" }],
        }],
    },
    {
        id: "attack-sound",
        title: "Dźwięk na każdy atak",
        description: "Gra dźwięk, gdy ktokolwiek cię zaatakuje, nie tylko ktoś z wrogiej gildii.",
        category: "Dźwięki",
        group: "Dźwięki",
        triggers: [{
            name: "Dźwięk na każdy atak",
            type: "event",
            event: "attack",
            macros: [{ type: "beep", soundKey: "beep" }],
        }],
    },
    {
        id: "hp-low-push",
        title: "Powiadomienie na telefon przy niskim życiu",
        description: "Wysyła powiadomienie na telefon, gdy kondycja spadnie do progu \"Alarmu niskiego zdrowia\" z ustawień. "
            + "Telefon parujesz w Ustawieniach interfejsu → Dźwięk i powiadomienia.",
        category: "Powiadomienia",
        group: "Powiadomienia",
        triggers: [{
            name: "Niskie życie na telefon",
            type: "event",
            event: "hp.low",
            macros: [{ type: "push", message: "Niskie życie: {text}", bypassCooldown: true }],
        }],
    },
    {
        id: "cocoons-alias",
        title: "Rozrywanie kokonów",
        description: "Alias kok: wpisz \"kok 1-5\", a wyśle \"rozerwij 1. kokon\", \"rozerwij 2. kokon\"... aż do 5. "
            + "\"kok 3\" rozerwie tylko trzeci kokon.",
        category: "Aliasy",
        group: "Aliasy",
        aliases: [{
            name: "Rozrywanie kokonów",
            pattern: "kok (\\d+(?:-\\d+)?)",
            command: "rozerwij $i. kokon",
        }],
    },
    {
        id: "transport-arrived-speak",
        title: "Przyjazd transportu na głos",
        description: "Czyta na głos nazwę pojazdu, który podjechał, gdy czekasz na przystanku. "
            + "Głos, tempo i głośność ustawiasz w Ustawieniach interfejsu → Dźwięk i powiadomienia.",
        category: "Powiadomienia",
        group: "Powiadomienia",
        triggers: [{
            name: "Przyjazd transportu na głos",
            type: "event",
            event: "transport.arrived",
            macros: [{ type: "speak", message: "{transport} na przystanku" }],
        }],
    },
];

export function recipePack(recipe: LibraryRecipe): AutomationPack {
    const group = { id: "library", name: recipe.group };
    const inGroup = <T extends object>(list: T[] = []) => list.map(item => ({ ...item, group: group.id }));
    return {
        format: PACK_FORMAT,
        version: 1,
        groups: [group],
        aliases: inGroup(recipe.aliases),
        triggers: inGroup(recipe.triggers),
        scripts: inGroup(recipe.scripts),
    };
}

/**
 * The stored elements a recipe already added, matched the way `importPack`
 * spots duplicates. Empty when it is not added; renaming an element keeps
 * the match, changing what it does does not.
 */
export function recipeItems(recipe: LibraryRecipe, items: AutomationItem[] = loadItems()): AutomationItem[] {
    const found: AutomationItem[] = [];
    for (const alias of recipe.aliases ?? []) {
        const item = items.find(i => i.kind === "alias" && i.data.pattern === alias.pattern);
        if (!item) return [];
        found.push(item);
    }
    for (const trigger of recipe.triggers ?? []) {
        const shape = triggerShape(trigger);
        const item = items.find(i => i.kind === "trigger" && triggerShape(i.data) === shape);
        if (!item) return [];
        found.push(item);
    }
    for (const script of recipe.scripts ?? []) {
        const item = items.find(i => i.kind === "script" && i.data.code === script.code);
        if (!item) return [];
        found.push(item);
    }
    return found;
}
