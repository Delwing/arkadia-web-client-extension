import Client from "../Client";

export default function initPrzybywajaCount(client: Client) {
    const pattern = /^[ >]*(.*) przybywaja\b/;
    client.Triggers.registerTrigger(pattern, (triggerLine, matches) => {
        const names = matches[1]
            .split(/,| i /)
            .map(name => name.trim())
            .filter(name => name.length > 0);
        const count = names.length;
        triggerLine.insert(0, `[${count}] `, {})
        return triggerLine;
    }, 'przybywaja-count');
}
