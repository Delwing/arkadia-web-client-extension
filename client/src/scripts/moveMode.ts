import Client from "../Client";

const LABELS = ["zwykly", "prz", "prz dr"];
const TITLES = ["zwykly", "przemknij", "przemknij z druzyna"];

export default function initMoveMode(client: Client) {
    const button = client.createButton(`Ruch: ${LABELS[0]}`, toggle);
    button.title = `Ruch: ${TITLES[0]}`;
    client.moveModeButton = button;

    function update() {
        button.value = `Ruch: ${LABELS[client.moveMode]}`;
        button.title = `Ruch: ${TITLES[client.moveMode]}`;
    }

    function toggle() {
        if (client.carriageMode) return;
        client.moveMode = (client.moveMode + 1) % LABELS.length;
        update();
    }
}
