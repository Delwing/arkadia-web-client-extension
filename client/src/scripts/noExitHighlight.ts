import Client from "../Client";
import { colorString, findClosestColor } from "../Colors";

export default function initNoExitHighlight(client: Client) {
    const TAN = findClosestColor("#d2b48c");
    const patterns = [
        /^[ >]*Nie widzisz zadnego wyjscia prowadzacego na .*\.$/,
        /^[ >]*Jestes tak zmeczon(?:y|a), ze nie mozesz dalej podazac w tym kierunku\.$/
    ];
    patterns.forEach(p => {
        client.Triggers.registerTrigger(p, (raw) => colorString(raw, TAN), "no-exit-highlight");
    });
}
