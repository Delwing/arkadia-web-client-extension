import Client from "../Client";

export default function initCarriage(client: Client) {
    const enable = () => {
        client.carriageMode = true;
        if (client.moveModeButton) {
            client.moveModeButton.disabled = true;
        }
        return undefined;
    };
    const disable = () => {
        client.carriageMode = false;
        if (client.moveModeButton) {
            client.moveModeButton.disabled = false;
        }
        return undefined;
    };
    client.Triggers.registerTrigger(/^Siadasz w (.*) bryczce\.$/, enable, "carriageMode");
    client.Triggers.registerTrigger(/^Zsiadasz z (.*) bryczki\.$/, disable, "carriageMode");
}
