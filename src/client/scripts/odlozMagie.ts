import Client from "../Client";
import loadMagics from "./lib/magicsLoader";

// Pre-commands map: item -> command to run before wloz
const preCommands: Record<string, string> = {
    "krysztalowa gryfia lampe": "odtrocz gryfia lampe",
};

// Corrections map: item -> corrected name, or false to skip
const corrections: Record<string, string | false> = {
    "plytach twojego starozytnego pancerza": "starozytna runiczna zbroje plytowa",
    "mosiezna duza broszka w ksztalcie liscia debu": "mosiezna duza broszke w ksztalcie liscia debu",
    "zielonym luskowatym plaszczem": "zielony luskowaty plaszcz",
    "szmaragdowozielonym misternym plaszczem": "szmaragdowozielony misterny plaszcz",
    "luskowata faktura zbroi wykonanej ze skory hydry": "gadzi polyskujacy pancerz",
    "migocaca diamentowa maska": "migocaca diamentowa maske",
    "dlugi runiczny korbacz": false,
    "dluga czarna szata": "dluga czarna szate",
    "krasnoludzka starozytna korone": false,
    "kruczoczarny misterny miecz": false,
    "zamkniety ozdobny skorzany plecak": false,
    "otwarty ozdobny skorzany plecak": false,
    "ozdobny skorzany plecak": false,
};

export default async function initOdlozMagie(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const patterns = await loadMagics();
    const regexps = patterns.map(p => new RegExp(p, 'i'));
    const finalPattern = /^(Masz przy sobie|Nie masz nic przy sobie)/;
    const tag = 'odloz-magie';

    function splitItems(text: string): string[] {
        return text.split(/,\s+|\s+i\s+/).map(s => s.trim()).filter(Boolean);
    }

    function findMaszPrzySobieItems(rawLine: string): string[] {
        const match = rawLine.match(/^Masz przy sobie\s+(.+)\.?\s*$/);
        if (!match) return [];
        const items = splitItems(match[1].replace(/\.\s*$/, ''));
        const result: string[] = [];
        for (const item of items) {
            for (const re of regexps) {
                if (re.test(item)) {
                    result.push(item);
                    break;
                }
            }
        }
        return result;
    }

    function buildCommands(items: string[], container: string): string[] {
        return items.flatMap(it => {
            if (corrections[it] === false) {
                return [];
            }
            const item = corrections[it] || it;
            const wlozCmd = `wloz ${item} do ${container}`;
            const preCmd = preCommands[it];
            return preCmd ? [preCmd, wlozCmd] : [wlozCmd];
        });
    }

    function run(container: string) {
        const found: string[] = [];
        const trigger = client.Triggers.registerTrigger(/^.*$/, (line) => {
            const rawLine = line.text;
            if (finalPattern.test(rawLine)) {
                client.Triggers.removeTrigger(trigger);
                const carriedItems = findMaszPrzySobieItems(rawLine);
                const allCommands = [
                    ...buildCommands(found, container),
                    ...buildCommands(carriedItems, container),
                ];
                client.FunctionalBind.set(allCommands.length > 0 ? allCommands.join(';') : null);
                return line;
            }
            regexps.forEach((re, idx) => {
                if (re.test(rawLine)) {
                    const item = patterns[idx];
                    if (!found.includes(item)) {
                        found.push(item);
                    }
                }
            });
            return line;
        }, tag);
        client.sendCommand('i');
    }

    if (aliases) {
        aliases.push({
            pattern: /^\/odloz_magie(?: (\w+))?$/,
            callback: (m: RegExpMatchArray) => {
                const container = m[1] || 'skrzyni';
                run(container);
            }
        });
    }
}

