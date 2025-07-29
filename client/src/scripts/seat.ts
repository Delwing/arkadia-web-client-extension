import Client from "../Client";

export default function initSeat(client: Client) {
    const tag = "seat";
    const pattern = /^Gdzie chcesz usiasc\?\s*([^?]+)\?$/;
    const sitPrompt = /(?:mowi do ciebie: )?A moze najpierw gdzies usiadziesz\?$/;

    client.Triggers.registerTrigger(pattern, (_raw, _line, matches) => {
        const options = matches[1]
            .split(/,| czy| lub/)
            .map(o => o.trim())
            .filter(o => o.length > 0);
        if (options.length === 0) return undefined;
        const choice = options[Math.floor(Math.random() * options.length)];
        const command = `usiadz ${choice}`.toLowerCase();
        client.FunctionalBind.set(command, () => client.sendCommand(command));
        return undefined;
    }, tag);

    client.Triggers.registerTrigger(sitPrompt, () => {
        client.FunctionalBind.set('usiadz', () => client.sendCommand('usiadz'));
        return undefined;
    }, tag);
}
