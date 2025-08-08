import Client from "../Client";

export default function initLanguage(client: Client, aliases?: { pattern: RegExp; callback: Function }[]) {
    if (!aliases) return;

    let currentLang = 'potoczna';
    let adjective = '';
    let lastLang: string | null = null;

    client.addEventListener('settings', (ev: CustomEvent) => {
        const detail = ev.detail || {};
        currentLang = detail.language || 'potoczna';
        adjective = detail.languageAdjective || '';
    });

    aliases.push({
        pattern: /^'(.*)$/,
        callback: (matches: RegExpMatchArray) => {
            const msg = matches[1];
            const lang = currentLang;
            const adj = adjective.trim();
            if (lang !== lastLang) {
                client.sendCommand(`justaw ${lang}`, false);
                lastLang = lang;
            }
            if (lang === 'potoczna' && adj === '') {
                client.sendCommand("'" + msg);
                return;
            }
            const verb = lang === 'potoczna' ? 'ppowiedz' : 'jpowiedz';
            const cmd = adj ? `${verb} ${adj} ${msg}` : `${verb} ${msg}`;
            client.sendCommand(cmd, false);
            client.clientAdapter.output("→ '" + msg, 'command');
            client.clientAdapter.flushMessageBuffer?.();
        }
    });
}
