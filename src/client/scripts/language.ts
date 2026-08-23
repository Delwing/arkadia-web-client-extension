import Client from "../Client";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

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

    lastLang = characterStorage.get(STORAGE_KEY) || '';

    client.scope.onDispose(characterStorage.onChange(STORAGE_KEY, (newValue) => {
        lastLang = newValue || '';
    }));

    function gagLanguageConfirmation() {
        client.Triggers.registerOneTimeTrigger(
            /^Ustawiles jezyk: .+\.$/,
            () => null,
            'language-gag'
        );
    }

    function setLanguage(lang: string) {
        if (lang !== lastLang && lang !== 'potoczna') {
            gagLanguageConfirmation();
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
        if (client.clientAdapter.shouldEchoCommand()) {
            client.clientAdapter.output("→ '" + msg, 'command');
            client.clientAdapter.flushMessageBuffer();
        }
    }

    client.aliases.push({
        pattern: /^justaw (.*)$/,
        callback: (matches: RegExpMatchArray) => {
            client.send('justaw ' + matches[1], false);
            lastLang = matches[1];
            characterStorage.set(STORAGE_KEY, lastLang);
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

    const initialSettings = characterStorage.get('settings');
    if (initialSettings) {
        const detail = (initialSettings ?? {}) as {
            language?: string;
            languageAdjective?: string;
            languageAliases?: { alias: string; adjective: string; language: string }[];
        };
        currentLang = detail.language || 'potoczna';
        adjective = detail.languageAdjective || '';
        applyAliases(detail.languageAliases || []);
    }

    client.scope.onDispose(characterStorage.onChange('settings', (settings) => {
        const detail = (settings ?? defaultSettings) as {
            language?: string;
            languageAdjective?: string;
            languageAliases?: { alias: string; adjective: string; language: string }[];
        };
        currentLang = detail.language || 'potoczna';
        adjective = detail.languageAdjective || '';
        applyAliases(detail.languageAliases || []);
    }));

    aliases.push({
        pattern: /^'(?!')(.*)$/,
        callback: (matches: RegExpMatchArray) => {
            const msg = matches[1];
            const lang = currentLang;
            const adj = adjective.trim();
            say(lang, adj, msg);
        }
    });
}
