import Client from "../Client";
import {colorTokenInLine, findClosestColor} from "@modules/core/Colors";
import loadMagics from "./magicsLoader";

export const MAGICS_COLOR = findClosestColor('#d75f5f');
export default async function initMagics(client: Client) {
    const tag = "magics";
    try {
        const magics = await loadMagics();
        magics.forEach((pattern: string) => {
            client.Triggers.registerTokenTrigger(pattern, (line) => {
                return colorTokenInLine(line, pattern, MAGICS_COLOR);
            }, tag, {caseInsensitive: true});
        });
    } catch (e) {
        console.error("Failed to load magics", e);
    }
}
