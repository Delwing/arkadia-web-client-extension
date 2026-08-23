import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer, FormatStateSnapshot} from "@client/ansi/FormatState";
import { characterStorage } from "@modules/core/storage";

const STORAGE_KEY = "containers";

const HEADER_COLOR = createColorFormat("#7cfc00");
const TYPE_COLOR = createColorFormat("#cfb530");
const BAG_COLOR = createColorFormat("#87ceeb");

const availableTypes = ["money", "gems", "food", "other"] as const;

const bagInBiernik: Record<string, string> = {
    plecak: "plecak",
    torba: "torbe",
    worek: "worek",
    sakiewka: "sakiewke",
    mieszek: "mieszek",
    sakwa: "sakwe",
    wor: "wor",
    szkatulka: "szkatulke",
    kaletka: "kaletke",
};

const bagInDopelniacz: Record<string, string> = {
    plecak: "plecaka",
    torba: "torby",
    worek: "worka",
    sakiewka: "sakiewki",
    mieszek: "mieszka",
    sakwa: "sakwy",
    wor: "wora",
    szkatulka: "szkatulki",
    kaletka: "kaletki",
};

const bagPronouns: Record<string, { biernik: string; dopelniacz: string }> = {
    plecak: { biernik: "swoj", dopelniacz: "swojego" },
    torba: { biernik: "swoja", dopelniacz: "swojej" },
    worek: { biernik: "swoj", dopelniacz: "swojego" },
    sakiewka: { biernik: "swoja", dopelniacz: "swojej" },
    mieszek: { biernik: "swoj", dopelniacz: "swojego" },
    sakwa: { biernik: "swoja", dopelniacz: "swojej" },
    wor: { biernik: "swoj", dopelniacz: "swojego" },
    szkatulka: { biernik: "swoja", dopelniacz: "swojej" },
    kaletka: { biernik: "swoja", dopelniacz: "swojej" },
};

export type ContainerType = (typeof availableTypes)[number];
type ContainerConfig = Record<ContainerType, string>;

const DEFAULT_CONTAINERS: ContainerConfig = {
    money: "plecak",
    gems: "plecak",
    food: "plecak",
    other: "plecak",
};

const containerConfig: ContainerConfig = { ...DEFAULT_CONTAINERS };

export interface ContainerForms {
    mianownik: string;
    dopelniacz: string;
    biernik: string;
}

export function getContainer(type: keyof ContainerConfig): string {
    return containerConfig[type];
}

export function getContainerForms(type: keyof ContainerConfig): ContainerForms | null {
    const bag = containerConfig[type];
    if (!bag || !bagInBiernik[bag]) return null;
    return {
        mianownik: bag,
        dopelniacz: bagInDopelniacz[bag],
        biernik: bagInBiernik[bag],
    };
}

function getBagForms(bag: string) {
    return {
        biernik: bagInBiernik[bag],
        dopelniacz: bagInDopelniacz[bag],
        pronoun_b: bagPronouns[bag].biernik,
        pronoun_d: bagPronouns[bag].dopelniacz,
    };
}

function saveConfig(_client: Client) {
    characterStorage.set(STORAGE_KEY, containerConfig);
}

function setContainer(type: keyof ContainerConfig, bag: string, client: Client) {
    containerConfig[type] = bag;
    client.print(`Ustawiono ${bag} jako pojemnik na '${type}'.`);
    saveConfig(client);
}

function setAll(bag: string, client: Client) {
    availableTypes.forEach((t) => (containerConfig[t] = bag));
    client.print(`Ustawiono ${bag} jako pojemnik na wszystkie typy.`);
    saveConfig(client);
}

export function containerAction(
    client: Client,
    type: keyof ContainerConfig,
    action: "put" | "take",
    item: string
) {
    const bag = containerConfig[type];
    if (!bag) {
        client.print(`Brak pojemnika dla typu '${type}'.`);
        return;
    }
    const forms = getBagForms(bag);
    const settings = characterStorage.get("settings");
    const shouldOpen = settings?.containerOpen !== false;
    const shouldClose = settings?.containerClose !== false;
    const items = item
        .split(",")
        .map((i) => i.trim())
        .filter((i) => i.length);
    if (shouldOpen) client.sendCommand(`otworz ${forms.pronoun_b} ${forms.biernik}`);
    items.forEach((it) =>
        client.sendCommand(
            action === "put"
                ? `wloz ${it} do ${forms.pronoun_d} ${forms.dopelniacz}`
                : `wez ${it} ze ${forms.pronoun_d} ${forms.dopelniacz}`
        )
    );
    if (shouldClose) client.sendCommand(`zamknij ${forms.pronoun_b} ${forms.biernik}`);
}

export function takeFromBag(
    client: Client,
    item: string,
    type: keyof ContainerConfig = "other"
) {
    containerAction(client, type, "take", item);
}

function showConfig(client: Client) {
    const pairs = availableTypes.map((t) => [t, containerConfig[t]]);

    const headers = ["typ", "pojemnik"];
    const col1Width = Math.max(...pairs.map(([t]) => t.length), headers[0].length);
    const col2Width = Math.max(...pairs.map(([, b]) => b.length), headers[1].length);

    const pad = (buf: AnsiAwareBuffer, len: number) => {
        const spaces = Math.max(0, len - buf.length);
        buf.append(" ".repeat(spaces), {});
        return buf;
    };

    const center = (text: string, len: number, color?: FormatStateSnapshot) => {
        const buf = new AnsiAwareBuffer();
        const l = text.length;
        const left = Math.floor((len - l) / 2);
        buf.append(" ".repeat(left), {});
        buf.appendBuffer(colorString(text, color));
        buf.append(" ".repeat(len - l - left), {});
        return buf;
    };

    const padSize = 3;
    const width = col1Width + col2Width + (padSize * 4) + 3;
    const horiz1 = "-".repeat(col1Width + padSize * 2);
    const horiz2 = "-".repeat(col2Width + padSize * 2);

    const lines: AnsiAwareBuffer[] = [];

    // Top border
    lines.push(new AnsiAwareBuffer(`/${"-".repeat(width - 2)}\\`));

    // Header with title
    const headerLine = new AnsiAwareBuffer("|");
    headerLine.appendBuffer(center("POJEMNIKI", width - 2, HEADER_COLOR));
    headerLine.append("|", {});
    lines.push(headerLine);

    // Separator
    lines.push(new AnsiAwareBuffer(`+${horiz1}+${horiz2}+`));

    // Column headers
    const headerRow = new AnsiAwareBuffer("|");
    headerRow.append(" ".repeat(padSize), {});
    headerRow.append(headers[0]);
    headerRow.append(" ".repeat(col1Width - headers[0].length + padSize), {});
    headerRow.append("|", {});
    headerRow.append(" ".repeat(padSize), {});
    headerRow.append(headers[1]);
    headerRow.append(" ".repeat(col2Width - headers[1].length + padSize), {});
    headerRow.append("|", {});
    lines.push(headerRow);

    // Separator
    lines.push(new AnsiAwareBuffer(`+${horiz1}+${horiz2}+`));

    // Data rows
    pairs.forEach(([t, b]) => {
        const row = new AnsiAwareBuffer("|");
        row.append(" ".repeat(padSize), {});
        const typeBuf = colorString(t, TYPE_COLOR);
        pad(typeBuf, col1Width);
        row.appendBuffer(typeBuf);
        row.append(" ".repeat(padSize), {});
        row.append("|");
        row.append(" ".repeat(padSize), {});
        const bagBuf = colorString(b, BAG_COLOR);
        pad(bagBuf, col2Width);
        row.appendBuffer(bagBuf);
        row.append(" ".repeat(padSize));
        row.append("|");
        lines.push(row);
    });

    // Bottom border
    lines.push(new AnsiAwareBuffer(`\\${"-".repeat(width - 2)}/`));

    // Combine all lines
    const output = new AnsiAwareBuffer();
    lines.forEach((line, i) => {
        if (i > 0) output.append("\n");
        output.appendBuffer(line);
    });

    client.println(output);
}

function showInterface(client: Client, bags: string[]) {
    const lines: AnsiAwareBuffer[] = [];
    bags.forEach((bag) => {
        const line = new AnsiAwareBuffer(`Ustaw ${bag} jako:`);
        availableTypes.forEach((type) => {
            const text = `${type}`;
            const textBuffer = colorString(text, TYPE_COLOR);
            textBuffer.createLink([0, text.length], {
                onClick: () => setContainer(type, bag, client),
                title: `Ustaw ${bag} jako ${type}`
            });
            line.append(" [ ", {});  // Explicitly use default (no color/link)
            line.appendBuffer(textBuffer);
            line.append(" ]", {});  // Explicitly use default (no color/link)
        });
        const allText = `wszystkie`;
        const allBuffer = colorString(allText, TYPE_COLOR);
        allBuffer.createLink([0, allText.length], {
            onClick: () => setAll(bag, client),
            title: `Ustaw wszystkie jako ${bag}`
        });
        line.append(" [ ", {});  // Explicitly use default (no color/link)
        line.appendBuffer(allBuffer);
        line.append(" ]", {});  // Explicitly use default (no color/link)
        lines.push(line);
    });

    const output = new AnsiAwareBuffer();
    lines.forEach((line, i) => {
        if (i > 0) output.append("\n");
        output.appendBuffer(line);
    });
    client.println(output);
}

function configure(client: Client) {
    const found: string[] = [];
    const tag = "bag-config";
    client.Triggers.registerTrigger(/.*/, (line) => {
        const rawLine = line.text.toLowerCase();
        if (rawLine.startsWith("masz przy sobie")) {
            client.Triggers.removeByTag(tag);
            showInterface(client, found);
        } else {
            Object.entries(bagInBiernik).forEach(([name, biernik]) => {
                const regex = new RegExp(`\\b${biernik}\\b`);
                if (regex.test(rawLine) && !found.includes(name)) {
                    found.push(name);
                }
            });
        }
        return line;
    }, tag);
    client.sendCommand("i");
}

export default function initBagManager(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    // getContainer is public plugin API and keeps returning the default bag rather
    // than null, so the reset here is back to the defaults, not to absence. What a
    // plugin should see once the owning script is off is decision 1 in
    // docs/SCRIPT_DEPENDENCIES.md.
    client.scope.onDispose(() => Object.assign(containerConfig, DEFAULT_CONTAINERS));

    const initialContainers = characterStorage.get(STORAGE_KEY);
    if (initialContainers) Object.assign(containerConfig, initialContainers);

    client.scope.onDispose(characterStorage.onChange(STORAGE_KEY, (newValue) => {
        if (newValue) Object.assign(containerConfig, newValue);
    }));
    client.scope.listen(window, "beforeunload", () => saveConfig(client));

    client.Triggers.registerTrigger(
        "Nie masz wystarczajacej ilosci pieniedzy, zeby zaplacic.",
        (line) => {
            client.FunctionalBind.set("wez monety z pojemnika", () => {
                containerAction(client, "money", "take", "monety");
            });
            return line;
        },
        "bagManager"
    );

    if (aliases) {
        aliases.push({ pattern: /^\/pojemnik$/, callback: () => configure(client) });
        aliases.push({ pattern: /^\/pojemniki$/, callback: () => showConfig(client) });
        aliases.push({ pattern: /^\/wdp (.*)/, callback: (m: RegExpMatchArray) => containerAction(client, "other", "put", m[1]) });
        aliases.push({ pattern: /^\/wzp (.*)/, callback: (m: RegExpMatchArray) => containerAction(client, "other", "take", m[1]) });
        aliases.push({ pattern: /^\/wlp$/, callback: () => containerAction(client, "other", "put", "pocztowa paczke") });
        aliases.push({ pattern: /^\/wep$/, callback: () => containerAction(client, "other", "take", "pocztowa paczke") });
        aliases.push({ pattern: /^\/?wem$/, callback: () => containerAction(client, "money", "take", "monety") });
        aliases.push({ pattern: /^\/?wlm$/, callback: () => containerAction(client, "money", "put", "monety") });
    }
}
