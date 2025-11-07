import Client from "../Client";
import { findClosestColor } from "@modules/core/Colors";

export default function initNoExitHighlight(client: Client) {
    const TAN = findClosestColor("#d2b48c");
    const patterns = [
        /^[ >]*Nie widzisz zadnego wyjscia prowadzacego na .*\.$/,
        /^[ >]*Jestes tak zmeczon[ya], ze nie mozesz dalej podazac w tym kierunku\.$/
    ];
    patterns.forEach(p => {
        client.Triggers.registerTrigger(p, (line) => {
            line.color([0, line.length], TAN);
            return line;
        }, "no-exit-highlight");
    });
}
