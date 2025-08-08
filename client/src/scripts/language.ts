import Client from "../Client";

function escapeRegExp(str: string) {
    return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export default function initLanguage(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    if (!aliases) return;

    let currentLang = 'potoczna';
    let adjective = '';
    let lastLang = '';
    let customAliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];

    function setLanguage(lang: string) {
        if (lang !== lastLang && lang !== 'potoczna') {
            client.sendCommand(`justaw ${lang}`, false);
        }
    }

    function say(lang: string, adj: string, msg: string) {
       setLanguage(lang);
        if (lang === 'potoczna' && adj === '') {
            client.sendCommand("'" + msg);
        } else {
            const verb = lang === 'potoczna' ? 'ppowiedz' : 'jppowiedz';
            const cmd = adj ? `${verb} ${adj} ${msg}` : `${verb} ${msg}`;
            client.sendCommand(cmd, false);
        }
        client.clientAdapter.output("→ '" + msg, 'command');
        client.clientAdapter.flushMessageBuffer();
    }

    client.aliases.push({
        pattern: /^justaw (.*)$/,
        callback: (matches: RegExpMatchArray) => {
            client.send('justaw ' + matches[1]);
            lastLang = matches[1];
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
