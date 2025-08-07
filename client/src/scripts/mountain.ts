import Client from "../Client";

export default function initMountain(client: Client) {
    let mountainMovingDir: "up" | "down" | undefined;
    const tag = "mountain";

    client.Triggers.registerTrigger(/Zaczynasz schodzic na dol\./, () => {
        mountainMovingDir = "down";
        return undefined;
    }, tag);

    client.Triggers.registerTrigger(/Zaczynasz wspinac sie/, () => {
        mountainMovingDir = "up";
        return undefined;
    }, tag);

    client.Triggers.registerTrigger(/Odpadasz od sciany i lecisz w dol/, () => {
        if (mountainMovingDir === "up") {
            client.Map.moveBack();
        }
        return undefined;
    }, tag);
}

