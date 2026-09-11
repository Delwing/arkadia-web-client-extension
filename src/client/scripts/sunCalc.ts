import Client from "../Client";

/**
 * Opens the sun calculator popup - sunrise/sunset for the current in-game day
 * computed from the observed grids in `sunModel.ts`, plus the Geheimnisnacht
 * forecast. Read-only companion to `/slonce`, which records observations.
 */
export default function initSunCalc(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[],
) {
    const list = aliases ?? client.aliases;

    list.push({
        pattern: /^\/slonce2$/,
        callback: () => {
            client.sendEvent("sunCalc.popup.open");
        },
    });
}
