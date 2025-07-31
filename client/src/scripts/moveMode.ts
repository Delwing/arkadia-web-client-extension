import Client from "../Client";

const LABELS = ["zwykly", "przemknij", "przemknij z druzyna"];

export default function initMoveMode(client: Client) {
    const button = client.createButton(`Ruch: ${LABELS[0]}`, toggle);
    client.moveModeButton = button;

    function update() {
        button.value = `Ruch: ${LABELS[client.moveMode]}`;
    }

    function toggle() {
        client.moveMode = (client.moveMode + 1) % LABELS.length;
        update();
    }
}
