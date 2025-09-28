import Client from "../Client";

function registerTempBind(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[],
    pattern: RegExp,
    index: number,
) {
    aliases.push({
        pattern,
        callback: (matches: RegExpMatchArray) => {
            const command = matches[1] ?? '';
            client.setTempBind(index, command);
        },
    });
}

export default function initTempBinds(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    registerTempBind(client, aliases, /^\/tbind1(?:\s+(.*))?$/, 0);
    registerTempBind(client, aliases, /^\/tbdind1(?:\s+(.*))?$/, 0);
    registerTempBind(client, aliases, /^\/tbind2(?:\s+(.*))?$/, 1);
}
