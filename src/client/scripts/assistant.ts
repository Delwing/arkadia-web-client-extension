import Client from "../Client";
import eventBus from "@modules/core/eventBus";

/**
 * `/pomoc` — opens the in-client AI assistant panel.
 *
 * The event bus is the seam, not `@client/ports/uiPort`: `src/client` may not
 * import the web UI at runtime (ESLint boundary), `UiPort` covers only
 * tooltips/context menus/key suppression, and adding a method there would force
 * every UI — headless test hosts included — to implement it. An unhandled
 * `eventBus.emit` is a harmless no-op instead, and 30+ `*.popup.open` events
 * already use this path.
 *
 * `emit` returns the number of listeners it reached, which is exactly the
 * signal needed to tell the user when no UI is listening.
 */
export default function initAssistant(
    client: Client,
    aliases: { pattern: RegExp; callback: Function }[],
) {
    const open = (payload?: { question?: string }) => {
        const listeners = eventBus.emit('assistant.popup.open', payload);
        if (listeners === 0) {
            client.print('Panel asystenta jest niedostepny w tym interfejsie.\n');
        }
    };

    aliases.push(
        {
            pattern: /^\/pomoc$/,
            callback: () => open(),
        },
        {
            pattern: /^\/pomoc\s+(.+)$/,
            callback: (matches: RegExpMatchArray) => open({ question: matches[1].trim() }),
        },
    );
}
