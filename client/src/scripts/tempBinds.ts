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

function registerTempBindKey(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[],
    pattern: RegExp,
    index: number,
) {
    aliases.push({
        pattern,
        callback: (matches: RegExpMatchArray) => {
            const description = matches[1] ?? '';
            client.setTempBindKey(index, description);
        },
    });
}

export default function initTempBinds(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    registerTempBind(client, aliases, /^\/tbind1(?:\s+(.*))?$/, 0);
    registerTempBind(client, aliases, /^\/tbdind1(?:\s+(.*))?$/, 0);
    registerTempBind(client, aliases, /^\/tbind2(?:\s+(.*))?$/, 1);
    registerTempBindKey(client, aliases, /^\/tbindkey1\s+(.+)$/, 0);
    registerTempBindKey(client, aliases, /^\/tbdindkey1\s+(.+)$/, 0);
    registerTempBindKey(client, aliases, /^\/tbindkey2\s+(.+)$/, 1);
}
