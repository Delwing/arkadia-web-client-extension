import Client from "../Client";
import {getItemSync, setItemSync} from "../storage";
import appEventBus from "../events/app-event-bus";

function escapeRegExp(str: string) {
    return str.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}

export default function initLanguage(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    if (!aliases) return;

    const STORAGE_KEY = 'lastLang';
    let currentLang = 'potoczna';
    let adjective = '';
    let lastLang = getItemSync(STORAGE_KEY)
    let customAliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];

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
            const cmd = adj ? `${verb} ${adj} ${msg}` : `${verb} ${msg}`;
            client.sendCommand(cmd, false);
        }
        client.clientAdapter.output("→ '" + msg, 'command');
    }

    client.aliases.push({
        pattern: /^justaw (.*)$/,
        callback: (matches: RegExpMatchArray) => {
            client.send('justaw ' + matches[1], false);
            lastLang = matches[1];
            setItemSync(STORAGE_KEY, lastLang);
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

    appEventBus.on('settings', (settings) => {
        currentLang = settings.language || 'potoczna';
        adjective = settings.languageAdjective || '';
        applyAliases(settings.languageAliases || []);
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
