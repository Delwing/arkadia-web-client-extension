import Client from "../Client";

const LABELS = ["zwykly", "prz", "prz dr"];
const TITLES = ["zwykly", "przemknij", "przemknij z druzyna"];

function getAvailableModes(client: Client) {
    const total = LABELS.length;
    if (client.TeamManager.isLeader?.()) {
        return total;
    }
    return Math.max(1, total - 1);
}

function clampMoveMode(client: Client) {
    const available = getAvailableModes(client);
    const maxIndex = Math.max(0, available - 1);
    if (client.moveMode > maxIndex) {
        client.moveMode = maxIndex;
        return true;
    }
    if (client.moveMode < 0) {
        client.moveMode = 0;
        return true;
    }
    return false;
}

export default function initMoveMode(client: Client) {
    const button = client.createButton(`Ruch: ${LABELS[0]}`, () => toggle(false));
    button.title = `Ruch: ${TITLES[0]}`;
    client.moveModeButton = button;
    let playerNum: string | undefined;

    function update() {
        clampMoveMode(client);
        const mode = client.moveMode;
        const valueLabel = `Ruch: ${LABELS[mode]}`;
        const valueTitle = `Ruch: ${TITLES[mode]}`;

        button.value = valueLabel;
        button.title = valueTitle;

        const assignedButton = client.moveModeButton;
        if (assignedButton && assignedButton !== button) {
            if (assignedButton instanceof HTMLInputElement) {
                assignedButton.value = valueLabel;
                assignedButton.title = valueTitle;
            } else {
                const prefix = assignedButton.dataset.moveModeLabel;
                const textLabel = prefix ? `${prefix} ${LABELS[mode]}` : valueLabel;
                const textTitle = prefix ? `${prefix} ${TITLES[mode]}` : valueTitle;
                assignedButton.textContent = textLabel;
                assignedButton.title = textTitle;
            }
        }
    }

    function emitChange() {
        client.sendEvent('moveModeChanged', client.moveMode);
    }

    function resetToNormal() {
        if (client.moveMode === 0) return;
        client.moveMode = 0;
        update();
        emitChange();
    }

    function toggle(notify = false) {
        if (client.carriageMode) return;
        const available = getAvailableModes(client) || 1;
        client.moveMode = (client.moveMode + 1) % available;
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

    client.addEventListener('gmcp.char.info', (ev: CustomEvent) => {
        const detail = ev.detail || {};
        if (detail && typeof detail.object_num !== 'undefined') {
            playerNum = String(detail.object_num);
        }
    });

    client.addEventListener('gmcp.objects.data', (ev: CustomEvent<Record<string, { attack_num?: boolean | number | string }>>) => {
        if (!playerNum) return;
        const detail = ev.detail;
        if (!detail || typeof detail !== 'object') return;
        const obj = detail[playerNum];
        if (!obj || obj.attack_num === undefined) return;
        if (obj.attack_num !== false) {
            resetToNormal();
        }
    });

    client.addEventListener('client.disconnect', () => {
        playerNum = undefined;
    });

    client.addEventListener('teamChange', () => {
        const changed = clampMoveMode(client);
        update();
        if (changed) {
            emitChange();
        }
    });

    update();
    emitChange();
}
