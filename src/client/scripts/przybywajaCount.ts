import Client from "../Client";

export default function initPrzybywajaCount(client: Client) {
    const pattern = /^[ >]*(.*) przybywaja\b/;
    client.Triggers.registerTrigger(pattern, (triggerLine) => {
        const matches = triggerLine.matches.matches as RegExpMatchArray;
        const raw = triggerLine.toAnsiString();
        const names = matches[1]
            .split(/,| i /)
            .map(name => name.trim())
            .filter(name => name.length > 0);
        const count = names.length;
        const formatted = `[${count}] ${raw}`;
        triggerLine.setOverrideAnsi(formatted);
        return triggerLine;
    }, 'przybywaja-count');
}
