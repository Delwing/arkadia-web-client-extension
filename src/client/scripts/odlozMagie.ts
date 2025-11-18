import Client from "../Client";
import loadMagics from "./magicsLoader";

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
                    const cmd = found.map(it => {
                        const item = it
                            .replace('zielonym luskowatym plaszczem', 'zielony luskowaty plaszcz')
                            .replace('dluga czarna szata', 'dluga czarna szate')
                            .replace('szmaragdowym misternym plaszczem', 'szmaragdowy misterny plaszcz');
                        return `wloz ${item} do ${container}`;
                    }).join(';');
                    client.FunctionalBind.set(cmd);
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

