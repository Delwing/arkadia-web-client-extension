import Client from "../Client";
import { colorString, findClosestColor } from "@modules/core/Colors";

export default function initNoExitHighlight(client: Client) {
    const TAN = findClosestColor("#d2b48c");
    const patterns = [
        /^[ >]*Nie widzisz zadnego wyjscia prowadzacego na .*\.$/,
        /^[ >]*Jestes tak zmeczon[ya], ze nie mozesz dalej podazac w tym kierunku\.$/
    ];
    patterns.forEach(p => {
        client.Triggers.registerTrigger(p, (raw) => colorString(raw, TAN), "no-exit-highlight");
    });
}
