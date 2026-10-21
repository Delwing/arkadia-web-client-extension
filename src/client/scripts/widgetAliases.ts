import Client from "../Client";

/** /widzety - turn widget edit mode (drag, add, remove widgets) on or off. */
export default function initWidgetAliases(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[],
) {
    const list = aliases ?? client.aliases;
    list.push({
        pattern: /^\/widzety$/,
        callback: () => client.sendEvent("widgets.edit", {}),
    });
}
