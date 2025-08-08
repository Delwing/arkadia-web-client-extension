import Client from "../Client";

function escapeRegExp(str: string) {
    return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export default function initLanguage(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    if (!aliases) return;

    let currentLang = 'potoczna';
    let adjective = '';
    let lastLang = 'potoczna';
    let customAliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];

    const applyAliases = (arr: { alias: string; adjective: string; language: string }[] = []) => {
        customAliases.forEach(a => {
            const idx = aliases.indexOf(a);
            if (idx !== -1) aliases.splice(idx, 1);
        });
        customAliases = arr.map(item => {
            const pattern = new RegExp('^' + escapeRegExp(item.alias) + '(.*)$');
            return {
                pattern,
                callback: (matches: RegExpMatchArray) => {
                    const msg = matches[1];
                    const lang = item.language;
                    const adj = item.adjective.trim();
                    if (lang !== lastLang && lang !== 'potoczna') {
                        client.sendCommand(`justaw ${lang}`, false);
                    }
                    lastLang = lang;
                    if (lang === 'potoczna' && adj === '') {
                        client.sendCommand("'" + msg);
                    } else {
                        const verb = lang === 'potoczna' ? 'ppowiedz' : 'jpowiedz';
                        const cmd = adj ? `${verb} ${adj} ${msg}` : `${verb} ${msg}`;
                        client.sendCommand(cmd, false);
                    }
                    client.clientAdapter.output("→ '" + msg, 'command');
                    client.clientAdapter.flushMessageBuffer?.();
                    if (currentLang !== lastLang) {
                        if (currentLang !== 'potoczna') {
                            client.sendCommand(`justaw ${currentLang}`, false);
                        }
                        lastLang = currentLang;
                    }
                }
            };
        });
        customAliases.forEach(a => aliases.push(a));
    };

    client.addEventListener('settings', (ev: CustomEvent) => {
        const detail = ev.detail || {};
        currentLang = detail.language || 'potoczna';
        adjective = detail.languageAdjective || '';
        applyAliases(detail.languageAliases || []);
    });

    aliases.push({
        pattern: /^'(.*)$/,
        callback: (matches: RegExpMatchArray) => {
            const msg = matches[1];
            const lang = currentLang;
            const adj = adjective.trim();
            if (lang !== lastLang && lang !== 'potoczna') {
                client.sendCommand(`justaw ${lang}`, false);
            }
            lastLang = lang;
            if (lang === 'potoczna' && adj === '') {
                client.sendCommand("'" + msg);
            } else {
                const verb = lang === 'potoczna' ? 'ppowiedz' : 'jpowiedz';
                const cmd = adj ? `${verb} ${adj} ${msg}` : `${verb} ${msg}`;
                client.sendCommand(cmd, false);
            }
            client.clientAdapter.output("→ '" + msg, 'command');
            client.clientAdapter.flushMessageBuffer?.();
        }
    });
}
