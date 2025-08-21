import Client from "../Client";

export default function initPrzybywajaCount(client: Client) {
    const pattern = /^[ >]*(.*) przybywaja/;
    client.Triggers.registerTrigger(pattern, (raw, _line, matches) => {
        const names = matches[1]
            .split(/,| i /)
            .map(name => name.trim())
            .filter(name => name.length > 0);
        const count = names.length;
        return `[${count}] ${raw}`;
    }, 'przybywaja-count');
}
