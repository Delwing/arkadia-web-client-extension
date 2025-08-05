import Client from "../Client";
import { colorStringInLine, findClosestColor } from "../Colors";
import loadMagicKeys from "./magicKeyLoader";

export const KEYS_COLOR = findClosestColor("#00ff7f");
export default async function initMagicKeys(client: Client) {
    const tag = "magicKeys";
    try {
        const keys = await loadMagicKeys();
        keys.forEach((pattern: string) => {
            client.Triggers.registerTokenTrigger(pattern, (raw) => {
                return colorStringInLine(raw, pattern, KEYS_COLOR);
            }, tag, { caseInsensitive: true});
        });
    } catch (e) {
        console.error("Failed to load magic keys", e);
    }
}
