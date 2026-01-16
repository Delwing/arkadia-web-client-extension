import Client from "../Client";
import { AnsiAwareBuffer } from "../ansi/FormatState";

export default function initSeat(client: Client) {
    const tag = "seat";
    const pattern = /^Gdzie chcesz usiasc\?\s*([^?]+)\?$/;
    const sitPrompt = /(?:mowi do ciebie: )?A moze najpierw gdzies usiadziesz\?$/;

    client.Triggers.registerTrigger(pattern, (line, matches) => {
        if (!matches || !matches[1]) return line;
        const options = matches[1]
            .split(/, | czy | lub /)
            .map(o => o.trim())
            .filter(o => o.length > 0);
        if (options.length === 0) return line;
        const choice = options[Math.floor(Math.random() * options.length)];
        const command = `usiadz ${choice}`.toLowerCase();
        client.FunctionalBind.set(command, () => client.sendCommand(command));

        // Create buffer with clickable options
        const buffer = line instanceof AnsiAwareBuffer ? line.clone() : new AnsiAwareBuffer(String(line));

        for (const option of options) {
            const optionCommand = `usiadz ${option}`.toLowerCase();
            buffer.createLinksForText(option, {
                onClick: () => client.sendCommand(optionCommand),
                title: optionCommand
            }, { caseInsensitive: true });
        }

        return buffer;
    }, tag);

    client.Triggers.registerTrigger(sitPrompt, (line) => {
        client.FunctionalBind.set('usiadz', () => client.sendCommand('usiadz'));
        return line;
    }, tag);
}
