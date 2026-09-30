import Client from "../Client";
import {colorString, createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import brokilonPatterns from "./brokilon_patterns.json";
import {upstreamPatterns, type UpstreamTrigger} from "./upstreamTriggers";

// Generated from upstream Arkadia.xml by scripts/extract-upstream-triggers.mjs.
const UPSTREAM = brokilonPatterns as UpstreamTrigger[];

export default function initBrokilon(client: Client) {
    const tag = "brokilon";
    const ORANGE_RED = createColorFormat("#ff4500");

    function formatLine(line: AnsiAwareBuffer, prefixText: string): AnsiAwareBuffer {
        const result = new AnsiAwareBuffer();
        result.append(prefixText, ORANGE_RED);
        result.appendBuffer(line.color([0, line.length], ORANGE_RED));
        return result;
    }

    // 1. Pulapka (trap)
    client.Triggers.registerTrigger(upstreamPatterns(UPSTREAM, "trigger_func_pulapka_brokilon"), (line) => {
        if (line.text.startsWith("Nagle czujesz")) {
            client.Map.moveBack();
        }
        client.FunctionalBind.set("przetnij rzemien");
        return formatLine(line, "[ PULAPKA ]  ");
    }, tag);

    // 2. Strzaly (arrows)
    client.Triggers.registerTrigger(upstreamPatterns(UPSTREAM, "trigger_func_strzaly"), (line) => {
        return formatLine(line, "[ STRZALY ]  ");
    }, tag);

    // 3. Rusalka (charm)
    client.Triggers.registerTrigger(upstreamPatterns(UPSTREAM, "trigger_func_rusalka"), (line) => {
        client.println(colorString("UROK RUSALKI", ORANGE_RED).prepend("\n").append("\n"));
        client.FunctionalBind.set("/zz rusalke");
        return formatLine(line, "[ UROK ]  ");
    }, tag);

    // 4. Rusalka2 (charm - can't attack)
    client.Triggers.registerTrigger(
        upstreamPatterns(UPSTREAM, "trigger_func_rusalka2"),
        (line) => {
            client.FunctionalBind.set("/zz rusalke");
            return formatLine(line, "[ UROK ]  ");
        },
        tag
    );
}
