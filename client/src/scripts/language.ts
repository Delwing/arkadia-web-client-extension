import Client from "../Client";

const STORAGE_KEY = 'lastLanguage';

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
                    if (lang !== lastLang) {
                        if (lang !== 'potoczna') {
                            client.sendCommand(`justaw ${lang}`, false);
                        } else if (lastLang !== 'potoczna') {
                            client.sendCommand('justaw potoczna', false);
                        }
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
                        } else {
                            client.sendCommand('justaw potoczna', false);
                        }
                        lastLang = currentLang;
                    }
                    client.port?.postMessage({ type: 'SET_STORAGE', key: STORAGE_KEY, value: lastLang });
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

    client.addEventListener('storage', (ev: CustomEvent) => {
        if (ev.detail.key === STORAGE_KEY) {
            lastLang = ev.detail.value || 'potoczna';
            if (lastLang !== 'potoczna') {
                client.sendCommand(`justaw ${lastLang}`, false);
            }
        }
    });

    client.addEventListener('port-connected', () => {
        client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });
    });
    client.port?.postMessage({ type: 'GET_STORAGE', key: STORAGE_KEY });

    aliases.push({
        pattern: /^'(.*)$/,
        callback: (matches: RegExpMatchArray) => {
            const msg = matches[1];
            const lang = currentLang;
            const adj = adjective.trim();
            if (lang !== lastLang) {
                if (lang !== 'potoczna') {
                    client.sendCommand(`justaw ${lang}`, false);
                } else if (lastLang !== 'potoczna') {
                    client.sendCommand('justaw potoczna', false);
                }
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
            client.port?.postMessage({ type: 'SET_STORAGE', key: STORAGE_KEY, value: lastLang });
        }
    });
}
