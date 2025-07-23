import Client from "../Client";
import {stripAnsiCodes} from "../Triggers";
import {colorString, findClosestColor} from "../Colors";

const STORAGE_KEY = "containers";

const HEADER_COLOR = findClosestColor("#7cfc00");
const TYPE_COLOR = findClosestColor("#cfb530");
const BAG_COLOR = findClosestColor("#87ceeb");

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

const containerConfig: ContainerConfig = {
    money: "plecak",
    gems: "plecak",
    food: "plecak",
    other: "plecak",
};

export function getContainer(type: keyof ContainerConfig): string {
    return containerConfig[type];
}

function getBagForms(bag: string) {
    return {
        biernik: bagInBiernik[bag],
        dopelniacz: bagInDopelniacz[bag],
        pronoun_b: bagPronouns[bag].biernik,
        pronoun_d: bagPronouns[bag].dopelniacz,
    };
}

function saveConfig(client: Client) {
    client.port?.postMessage({ type: "SET_STORAGE", key: STORAGE_KEY, value: containerConfig });
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
    const items = item
        .split(",")
        .map((i) => i.trim())
        .filter((i) => i.length);
    client.sendCommand(`otworz ${forms.pronoun_b} ${forms.biernik}`);
    items.forEach((it) =>
        client.sendCommand(
            action === "put"
                ? `wloz ${it} do ${forms.pronoun_d} ${forms.dopelniacz}`
                : `wez ${it} ze ${forms.pronoun_d} ${forms.dopelniacz}`
        )
    );
    client.sendCommand(`zamknij ${forms.pronoun_b} ${forms.biernik}`);
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

    const headerColor = HEADER_COLOR;
    const typeColor = TYPE_COLOR;
    const bagColor = BAG_COLOR;

    const headers = ["typ", "pojemnik"];
    const col1Width = Math.max(...pairs.map(([t]) => t.length), headers[0].length);
    const col2Width = Math.max(...pairs.map(([, b]) => b.length), headers[1].length);

    const visible = (str: string) => stripAnsiCodes(str).length;
    const pad = (str: string, len: number) => str + " ".repeat(Math.max(0, len - visible(str)));
    const center = (str: string, len: number) => {
        const l = visible(str);
        const left = Math.floor((len - l) / 2);
        return " ".repeat(left) + str + " ".repeat(len - l - left);
    };

    const padSize = 3;
    const width = col1Width + col2Width + (padSize * 4) + 3;
    const horiz1 = "-".repeat(col1Width + padSize * 2);
    const horiz2 = "-".repeat(col2Width + padSize * 2);

    const lines: string[] = [];
    lines.push(`/${"-".repeat(width - 2)}\\`);
    lines.push(`|${center(colorString("POJEMNIKI", headerColor), width - 2)}|`);
    lines.push(`+${horiz1}+${horiz2}+`);
    lines.push(`|${" ".repeat(padSize)}${pad(headers[0], col1Width)}${" ".repeat(padSize)}|${" ".repeat(padSize)}${pad(headers[1], col2Width)}${" ".repeat(padSize)}|`);
    lines.push(`+${horiz1}+${horiz2}+`);
    pairs.forEach(([t, b]) => {
        const type = colorString(t, typeColor);
        const bag = colorString(b, bagColor);
        lines.push(`|${" ".repeat(padSize)}${pad(type, col1Width)}${" ".repeat(padSize)}|${" ".repeat(padSize)}${pad(bag, col2Width)}${" ".repeat(padSize)}|`);
    });
    lines.push(`\\${"-".repeat(width - 2)}/`);
    client.println(lines.join("\n"));
}

function showInterface(client: Client, bags: string[]) {
    const lines: string[] = [];
    bags.forEach((bag) => {
        let line = `Ustaw ${bag} jako:`;
        availableTypes.forEach((type) => {
            const text = `${type}`;
            line += " [ " + colorString(client.OutputHandler.makeClickable(text, text, () => setContainer(type, bag, client)), TYPE_COLOR) + " ]";
        });
        const allText = `wszystkie`;
        line += " [ " + colorString(client.OutputHandler.makeClickable(allText, allText, () => setAll(bag, client)), TYPE_COLOR) + " ]";
        lines.push(line);
    });
    client.println(lines.join("\n"));
}

function configure(client: Client) {
    const found: string[] = [];
    const tag = "bag-config";
    client.Triggers.registerTrigger(/.*/, (raw) => {
        const l = stripAnsiCodes(raw).replace(/\s$/g, "").toLowerCase();
        if (l.startsWith("masz przy sobie")) {
            client.Triggers.removeByTag(tag);
            showInterface(client, found);
        } else {
            Object.entries(bagInBiernik).forEach(([name, biernik]) => {
                if (l.includes(biernik) && !found.includes(name)) {
                    found.push(name);
                }
            });
        }
        return raw;
    }, tag);
    client.sendCommand("i");
}

export default function initBagManager(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    client.addEventListener("storage", (ev: CustomEvent) => {
        if (ev.detail.key === STORAGE_KEY && ev.detail.value) {
            Object.assign(containerConfig, ev.detail.value);
        }
    });
    client.port?.postMessage({ type: "GET_STORAGE", key: STORAGE_KEY });
    window.addEventListener("beforeunload", () => saveConfig(client));

    if (aliases) {
        aliases.push({ pattern: /\/pojemnik$/, callback: () => configure(client) });
        aliases.push({ pattern: /\/pojemniki$/, callback: () => showConfig(client) });
        aliases.push({ pattern: /\/wdp (.*)/, callback: (m: RegExpMatchArray) => containerAction(client, "other", "put", m[1]) });
        aliases.push({ pattern: /\/wzp (.*)/, callback: (m: RegExpMatchArray) => containerAction(client, "other", "take", m[1]) });
        aliases.push({ pattern: /\/wlp$/, callback: () => containerAction(client, "other", "put", "pocztowa paczke") });
        aliases.push({ pattern: /\/wep$/, callback: () => containerAction(client, "other", "take", "pocztowa paczke") });
        aliases.push({ pattern: /\/?wem$/, callback: () => containerAction(client, "money", "take", "monety") });
        aliases.push({ pattern: /\/?wlm$/, callback: () => containerAction(client, "money", "put", "monety") });
    }
}
