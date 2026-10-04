import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import MapHelper from "@shared/map/MapHelper";
import {getBehaviorSettings} from "@modules/core/settings";
import {createGateEntryTracker, getGateBindString} from "./gateBind";

export default function initGates(client: Client) {
    const knock = () => {
        client.Map.executeBind(getGateBindString(client.Map.currentRoom));
    };
    client.FunctionalBind.setCategory('gates', null, knock);

    // The room the gate bind was offered in. The closed-gate trigger never
    // cleared it, so with nothing set after it the key kept knocking on that
    // gate (its own `gate` command included) anywhere the player went next.
    let gateBindRoomId: number | undefined;

    const setGateBind = () => {
        gateBindRoomId = client.Map.currentRoom?.id;
        const printable = MapHelper.getBindPrintable(getGateBindString(client.Map.currentRoom));
        client.FunctionalBind.setCategory('gates', printable, knock, false);
    };

    const showMessage = (line: AnsiAwareBuffer) => {
        setGateBind();
        return line;
    };

    const patterns = [
        /^Probujesz otworzyc .*wrota.*/,
        /^Probujesz otworzyc .*drzwiczki.*/,
        /^Probujesz otworzyc .*krate.*/,
        /^Probujesz otworzyc .*brame.*/,
        /^Probujesz otworzyc niewielka furtke.*/,
    ];

    patterns.forEach(p => client.Triggers.registerTrigger(p, showMessage, "gates"));

    // Optional: offer the gate command on the functional bind as soon as the
    // player enters a gate location, without waiting for the closed-gate
    // message. Off by default - the trigger above is the usual entry point.
    // Like the location-bind chip, it only surfaces when walking into a gate
    // location from a regular one: gate -> gate means the gate was just crossed.
    const gateEntry = createGateEntryTracker();
    let pendingBind: (() => void) | undefined;
    client.on('enterLocation', () => {
        pendingBind?.();
        pendingBind = undefined;
        const room = client.Map.currentRoom;
        if (room?.id !== gateBindRoomId) {
            gateBindRoomId = undefined;
            client.FunctionalBind.clearCategory('gates');
        }
        // Always track, so the verdict stays right when the option is toggled.
        const atFreshGate = gateEntry.update(room);
        if (getBehaviorSettings().gateAsFunctionalBind !== true) {
            return;
        }
        if (!atFreshGate) {
            client.FunctionalBind.clearCategory('gates');
            return;
        }
        // Defer to the end of the message so the bind line lands under the
        // room description, the same way map binds do.
        const roomId = room?.id;
        const abort = new AbortController();
        pendingBind = () => abort.abort();
        client.on('output-sent', () => {
            pendingBind = undefined;
            if (client.Map.currentRoom?.id !== roomId) {
                return;
            }
            setGateBind();
        }, {once: true, signal: abort.signal});
    });
}
