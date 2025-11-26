import Client from "../Client";
import loadMagics from "./magicsLoader";

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

    function run(container: string) {
        const found: string[] = [];
        const trigger = client.Triggers.registerTrigger(/^.*$/, (line) => {
            const rawLine = line.text;
            regexps.forEach((re, idx) => {
                if (re.test(rawLine)) {
                    const item = patterns[idx];
                    if (!found.includes(item)) {
                        found.push(item);
                    }
                }
            });
            if (finalPattern.test(rawLine)) {
                client.Triggers.removeTrigger(trigger);
                if (found.length > 0) {
                    const commands = found
                        .flatMap(it => {
                            // Check if item should be skipped or corrected
                            if (corrections[it] === false) {
                                return [];
                            }
                            const item = corrections[it] || it;
                            const wlozCmd = `wloz ${item} do ${container}`;
                            // Check if item needs a pre-command
                            const preCmd = preCommands[it];
                            return preCmd ? [preCmd, wlozCmd] : [wlozCmd];
                        });

                    if (commands.length > 0) {
                        client.FunctionalBind.set(commands.join(';'));
                    } else {
                        client.FunctionalBind.set(null);
                    }
                } else {
                    client.FunctionalBind.set(null);
                }
                return line;
            }
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

