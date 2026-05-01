import Client from "../Client";

export default function initLocalizers(client: Client) {
    client.Triggers.registerTrigger("Otworzyly sie drzwi klatki.", (line) => {
        client.Map.refreshPosition = true;
        return line;
    });
}
