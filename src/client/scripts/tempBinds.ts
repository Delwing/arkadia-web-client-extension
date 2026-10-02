import Client from "../Client";

/** `/tbindN [komenda]` sets (or clears) temp bind N, for every slot the keymap has. */
export default function initTempBinds(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    aliases.push({
        pattern: /^\/tbind(\d+)(?:\s+(.*))?$/,
        callback: (matches: RegExpMatchArray) => {
            const index = parseInt(matches[1], 10) - 1;
            if (index < 0) return;
            client.setTempBind(index, matches[2] ?? '');
        },
    });
}
