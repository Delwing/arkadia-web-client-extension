import Client from "../Client";

export default function initWalkCommands(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    // /pre_walk cmd1#cmd2 - set pre-walk commands
    aliases.push({
        pattern: /^\/pre_walk\s+(.+)$/,
        callback: (matches: RegExpMatchArray) => {
            const commands = matches[1].split('#').map(cmd => cmd.trim()).filter(cmd => cmd);
            client.preWalkCommands = commands;
            client.println(`Pre-walk: ${commands.join(', ')}`);
        },
    });

    // /pre_walk- - clear pre-walk commands
    aliases.push({
        pattern: /^\/pre_walk-$/,
        callback: () => {
            client.preWalkCommands = [];
            client.println('Pre-walk wyczyszczone.');
        },
    });

    // /post_walk cmd1#cmd2 - set post-walk commands
    aliases.push({
        pattern: /^\/post_walk\s+(.+)$/,
        callback: (matches: RegExpMatchArray) => {
            const commands = matches[1].split('#').map(cmd => cmd.trim()).filter(cmd => cmd);
            client.postWalkCommands = commands;
            client.println(`Post-walk: ${commands.join(', ')}`);
        },
    });

    // /post_walk- - clear post-walk commands
    aliases.push({
        pattern: /^\/post_walk-$/,
        callback: () => {
            client.postWalkCommands = [];
            client.println('Post-walk wyczyszczone.');
        },
    });
}
