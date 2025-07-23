import Client from "../Client";
import { stripAnsiCodes } from "../Triggers";

export default function initLocalizers(client: Client) {
    const tag = "localizers";
    const text = "Postoj, placyk w Grabowej Buchcie";
    client.Triggers.registerTrigger(text, (raw) => {
        const line = stripAnsiCodes(raw).replace(/\s$/g, "");
        if (line === text) {
            client.Map.setMapRoomById(3525);
            client.sendEvent('notify', { text: `Map Sync: localizer 3525` });
        }
        return raw;
    }, tag);
}
