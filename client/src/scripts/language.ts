import Client from "../Client";
import { getClientStore } from "../state/scriptStore";

function escapeRegExp(str: string) {
    return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export default function initLanguage(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    const store = getClientStore(client);
    if (!aliases) return;

    const STORAGE_KEY = 'lastLang';
    let currentLang = 'potoczna';
    let adjective = '';
    let lastLang = '';
    let customAliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];

    store.subscribeStorage<string>(STORAGE_KEY, (value) => {
        lastLang = typeof value === 'string' ? value : '';
    });

    void (async () => {
        const stored = await store.getStorageItem<string>(STORAGE_KEY);
        if (typeof stored === 'string') {
            lastLang = stored;
        }
    })();

    function setLanguage(lang: string) {
        if (lang !== lastLang && lang !== 'potoczna') {
            client.sendCommand(`justaw ${lang}`, false);
        }
    }

    function say(lang: string, adj: string, msg: string) {
       setLanguage(lang);
        if (lang === 'potoczna' && adj === '') {
            client.send("'" + msg, false);
        } else {
            const verb = lang === 'potoczna' ? 'ppowiedz' : 'jppowiedz';
            if (msg.trim().length == 0) {
                client.send("'");
            }
            const cmd = adj ? `${verb} ${adj} ${msg}` : `${verb} ${msg}`;
            client.sendCommand(cmd, false);
        }
        client.clientAdapter.output("→ '" + msg, 'command');
        client.clientAdapter.flushMessageBuffer();
    }

    client.aliases.push({
        pattern: /^justaw (.*)$/,
        callback: (matches: RegExpMatchArray) => {
            client.send('justaw ' + matches[1], false);
            lastLang = matches[1];
            void store.setStorageItem(STORAGE_KEY, lastLang);
        }
    })

    const applyAliases = (arr: { alias: string; adjective: string; language: string }[] = []) => {
        customAliases.forEach(a => {
            const idx = aliases.indexOf(a);
            if (idx !== -1) aliases.splice(idx, 1);
        });
        customAliases = arr.map(item => {
            const pattern = new RegExp('^' + escapeRegExp(item.alias) + ' ?(.*)$');
            return {
                pattern,
                callback: (matches: RegExpMatchArray) => {
                    const msg = matches[1];
                    const lang = item.language;
                    const adj = item.adjective.trim();
                    say(lang, adj, msg);
                    setLanguage(currentLang);
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
        pattern: /^' ?(.*)$/,
        callback: (matches: RegExpMatchArray) => {
            const msg = matches[1];
            const lang = currentLang;
            const adj = adjective.trim();
            say(lang, adj, msg);
        }
    });
}
