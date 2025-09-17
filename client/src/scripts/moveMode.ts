import Client from "../Client";

const LABELS = ["zwykly", "prz", "prz dr"];
const TITLES = ["zwykly", "przemknij", "przemknij z druzyna"];

export default function initMoveMode(client: Client) {
    const button = client.createButton(`Ruch: ${LABELS[0]}`, () => toggle(false));
    button.title = `Ruch: ${TITLES[0]}`;
    client.moveModeButton = button;

    function update() {
        button.value = `Ruch: ${LABELS[client.moveMode]}`;
        button.title = `Ruch: ${TITLES[client.moveMode]}`;
    }

    function emitChange() {
        client.sendEvent('moveModeChanged', client.moveMode);
    }

    function toggle(notify = false) {
        if (client.carriageMode) return;
        client.moveMode = (client.moveMode + 1) % LABELS.length;
        update();
        emitChange();
        if (notify) {
            client.println(`Tryb ruchu: ${TITLES[client.moveMode]}`);
        }
    }

    window.addEventListener('keydown', (ev) => {
        const bind = client.moveModeBind;
        if (
            (ev.code === bind.key || ev.key === bind.key) &&
            !!bind.ctrl === ev.ctrlKey &&
            !!bind.alt === ev.altKey &&
            !!bind.shift === ev.shiftKey
        ) {
            toggle(true);
            ev.preventDefault();
        }
    });

    emitChange();
}
