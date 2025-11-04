import Client from "../Client";
import loadMagics from "./magicsLoader";

export default async function initOdlozMagie(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const patterns = await loadMagics();
    const regexps = patterns.map(p => new RegExp(p, 'i'));
    const finalPattern = /^(Masz przy sobie|Nie masz nic przy sobie)/;
    const tag = 'odloz-magie';

    function run(container: string) {
        const found: string[] = [];
        const trigger = client.Triggers.registerTrigger(/^.*$/, (triggerLine) => {
            const line = triggerLine.text;
            regexps.forEach((re, idx) => {
                if (re.test(line)) {
                    const item = patterns[idx];
                    if (!found.includes(item)) {
                        found.push(item);
                    }
                }
            });
            if (finalPattern.test(line)) {
                client.Triggers.removeTrigger(trigger);
                if (found.length > 0) {
                    const cmd = found.map(it => `wloz ${it} do ${container}`).join(';');
                    client.FunctionalBind.set(cmd);
                } else {
                    client.FunctionalBind.set(null);
                }
                return triggerLine;
            }
            return triggerLine;
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

