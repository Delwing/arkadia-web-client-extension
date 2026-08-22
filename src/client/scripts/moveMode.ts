import Client from "../Client";
import {bindMatches} from "@modules/core/keymapTypes";

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
    let playerNum: number | undefined;

    function update() {
        clampMoveMode(client);
        const mode = client.moveMode;
        const valueLabel = `Ruch: ${LABELS[mode]}`;
        const valueTitle = `Ruch: ${TITLES[mode]}`;

        const assignedButton = client.moveModeButton;
        if (assignedButton) {
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

    client.scope.listen(window, 'keydown', (ev) => {
        if (bindMatches(ev, client.moveModeBind)) {
            toggle(true);
            ev.preventDefault();
        }
    });

    client.on('helperBind', (bindName) => {
        if (bindName === 'moveMode') toggle(true);
    });

    client.on('gmcp.char.info', info => {
        if (info && typeof info.object_num !== 'undefined') {
            playerNum = info.object_num;
        }
    });

    client.on('gmcp.objects.data', (objects) => {
        if (!playerNum) return;
        const obj = objects[playerNum];
        if (!obj || obj.attack_num === undefined) return;
        if (obj.attack_num !== false) {
            resetToNormal();
        }
    });

    client.on('client.disconnect', () => {
        playerNum = undefined;
    });

    client.on('teamChange', () => {
        const changed = clampMoveMode(client);
        update();
        if (changed) {
            emitChange();
        }
    });

    client.Triggers.registerTrigger(
        /^Ochlon chociaz chwile od walki\.\.\.$/,
        (line) => {
            if (client.moveMode !== 1 && client.moveMode !== 2) {
                return line;
            }
            if (!client.Map.isBlockable) {
                return line;
            }
            client.Map.moveBack();
            client.Map.setBlockable(false);
            return line;
        },
        'przemknij-cooldown'
    );

    client.Triggers.registerTrigger(
        /^Nie ma przy tobie nikogo z twojej druzyny\.$/,
        (line) => {
            if (client.moveMode !== 2) {
                return line;
            }
            if (!client.Map.isBlockable) {
                return line;
            }
            client.Map.moveBack();
            client.Map.setBlockable(false);
            return line;
        },
        'przemknij-no-team'
    );

    update();
    emitChange();
}
