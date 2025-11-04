import Client from "../Client";

export default function initCarriage(client: Client) {
    const enable = (triggerLine) => {
        client.carriageMode = true;
        if (client.moveModeButton) {
            client.moveModeButton.disabled = true;
        }
        return triggerLine;
    };
    const disable = (triggerLine) => {
        client.carriageMode = false;
        if (client.moveModeButton) {
            client.moveModeButton.disabled = false;
        }
        return triggerLine;
    };
    client.Triggers.registerTrigger(/^Siadasz w (.*) bryczce\.$/, enable, "carriageMode");
    client.Triggers.registerTrigger(/^Zsiadasz z (.*) bryczki\.$/, disable, "carriageMode");
}
