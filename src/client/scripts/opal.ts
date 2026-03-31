import Client from "../Client";

/*
For better future implementation:
xxx odnajduje cos w podlodze jaskini.
W szczelinie miedzy dwiema skalnymi plytami podlogi odnajdujesz niewielki otwor.
 */

const UP_LOCATION = 17253;

export default function initOpal(client: Client) {
    let connectedId: number | false = false;

    client.on("enterLocation", (detail) => {
        const {id, direction} = detail as { id: number; direction: string | null };

        if (id !== UP_LOCATION) {
            return;
        }

        if (direction === "down") {
            const history = client.Map.locationHistory;
            if (history.length >= 2) {
                connectedId = history[history.length - 2];
                client.Map.getRoomById(UP_LOCATION).exits.up = connectedId;
            }
        }
    });

}
