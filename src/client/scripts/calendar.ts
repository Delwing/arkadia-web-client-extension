import Client from "../Client";

/**
 * Opens the calendar popup - the in-game year laid out month by month with
 * sunrise hours, moon phases, seasons and Geheimnisnacht.
 */
export default function initCalendar(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[],
) {
    const list = aliases ?? client.aliases;

    list.push({
        pattern: /^\/kalendarz$/,
        callback: () => {
            client.sendEvent("calendar.popup.open");
        },
    });
}
