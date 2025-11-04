import Client from "../Client";
import {colorTokenInLine, findClosestColor} from "@modules/core/Colors";
import loadMagicKeys from "./magicKeyLoader";

export const KEYS_COLOR = findClosestColor("#00ff7f");
export default async function initMagicKeys(client: Client) {
    const tag = "magicKeys";
    try {
        const keys = await loadMagicKeys();
        keys.forEach((pattern: string) => {
            client.Triggers.registerTokenTrigger(pattern, (triggerLine) => {
                return colorTokenInLine(triggerLine, pattern, KEYS_COLOR);
            }, tag, { caseInsensitive: true });
        });
    } catch (e) {
        console.error("Failed to load magic keys", e);
    }
}
