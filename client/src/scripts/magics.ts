import Client from "../Client";
import {colorStringInLine, findClosestColor} from "../Colors";
import loadMagics from "./magicsLoader";

export const MAGICS_COLOR = findClosestColor('#cc3c3c');
export default async function initMagics(client: Client) {
    const tag = "magics";
    try {
        const magics = await loadMagics();
        magics.forEach((pattern: string) => {
            client.Triggers.registerTokenTrigger(pattern, (raw) => {
                return colorStringInLine(raw, pattern, MAGICS_COLOR);
            }, tag);
        }, {caseInsensitive: true});
    } catch (e) {
        console.error("Failed to load magics", e);
    }
}
