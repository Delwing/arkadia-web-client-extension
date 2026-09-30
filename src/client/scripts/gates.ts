import Client from "../Client";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import MapHelper from "@shared/map/MapHelper";
import {getBehaviorSettings} from "@modules/core/settings";
import {createGateEntryTracker, getGateBindString} from "./gateBind";
import gatesPatterns from "./gates_patterns.json";
import {upstreamPatterns, type UpstreamTrigger} from "./upstreamTriggers";

export default function initGates(client: Client) {
    const knock = () => {
        client.Map.executeBind(getGateBindString(client.Map.currentRoom));
    };
    client.FunctionalBind.setCategory('gates', null, knock);

    const setGateBind = () => {
        const printable = MapHelper.getBindPrintable(getGateBindString(client.Map.currentRoom));
        client.FunctionalBind.setCategory('gates', printable, knock, false);
    };

    const showMessage = (line: AnsiAwareBuffer) => {
        setGateBind();
        return line;
    };

    // Generated from upstream Arkadia.xml by scripts/extract-upstream-triggers.mjs.
    upstreamPatterns(gatesPatterns as UpstreamTrigger[], "trigger_func_mapper_gates_gates")
        .forEach(p => client.Triggers.registerTrigger(p, showMessage, "gates"));

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
