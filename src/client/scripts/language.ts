import Client from "../Client";

function escapeRegExp(str: string) {
    return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export default function initLanguage(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    if (!aliases) return;

    const STORAGE_KEY = 'lastLang';
    let currentLang = 'potoczna';
    let adjective = '';
    let lastLang = '';
    let customAliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];

    client.on('storage', ({ key, value }) => {
        if (key === STORAGE_KEY) {
            lastLang = (value as string) || '';
        }
    });

    client.on('port-connected', () => {
        client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
    });

    client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });

    function setLanguage(lang: string) {
        if (lang !== lastLang && lang !== 'potoczna') {
            client.sendCommand(`justaw ${lang}`, false);
        }
    }

    function say(lang: string, adj: string, msg: string) {
        const trimmedMsg = msg.trim();
        if (trimmedMsg.length === 0) {
            client.send("'", false);
        } else {
            setLanguage(lang);
            if (lang === 'potoczna' && adj === '') {
                client.send("'" + msg, false);
            } else {
                const verb = lang === 'potoczna' ? 'ppowiedz' : 'jppowiedz';
                const cmd = adj ? `${verb} ${adj} ${msg}` : `${verb} ${msg}`;
                client.sendCommand(cmd, false);
            }
        }
        client.clientAdapter.output("→ '" + msg, 'command');
        client.clientAdapter.flushMessageBuffer();
    }

    client.aliases.push({
        pattern: /^justaw (.*)$/,
        callback: (matches: RegExpMatchArray) => {
            client.send('justaw ' + matches[1], false);
            lastLang = matches[1];
            client.port?.postMessage({ type: 'SET_STORAGE', key: STORAGE_KEY, value: lastLang });
        }
    })

    const applyAliases = (arr: { alias: string; adjective: string; language: string }[] = []) => {
        customAliases.forEach(a => {
            const idx = aliases.indexOf(a);
            if (idx !== -1) aliases.splice(idx, 1);
        });
        customAliases = arr.map(item => {
            // Require space after alias if there's text: 'jp hello' works, 'jphello' doesn't
            const pattern = new RegExp('^' + escapeRegExp(item.alias) + '(?:\\s(.*))?$');
            return {
                pattern,
                callback: (matches: RegExpMatchArray) => {
                    const msg = matches[1] || '';
                    const lang = item.language;
                    const adj = item.adjective.trim();
                    say(lang, adj, msg);
                    setLanguage(currentLang);
                }
            };
        });
        customAliases.forEach(a => aliases.push(a));
    };

    client.on('settings', (settings) => {
        const detail = (settings ?? {}) as {
            language?: string;
            languageAdjective?: string;
            languageAliases?: { alias: string; adjective: string; language: string }[];
        };
        currentLang = detail.language || 'potoczna';
        adjective = detail.languageAdjective || '';
        applyAliases(detail.languageAliases || []);
    });

    aliases.push({
        pattern: /^' ?(.*)$/,
        callback: (matches: RegExpMatchArray) => {
            const msg = matches[1];
            const lang = currentLang;
            const adj = adjective.trim();
            say(lang, adj, msg);
        }
    });
}
