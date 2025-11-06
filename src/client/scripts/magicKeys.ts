import Client from "../Client";
import {colorTokenInLine} from "@modules/core/Colors";
import loadMagicKeys from "./magicKeyLoader";
import {MAGIC_KEYS_COLOR as KEYS_COLOR} from "../constants/colors";

export default async function initMagicKeys(client: Client) {
    const tag = "magicKeys";
    try {
        const keys = await loadMagicKeys();
        keys.forEach((pattern: string) => {
            client.Triggers.registerTokenTrigger(pattern, (line) => {
                return colorTokenInLine(line, pattern, KEYS_COLOR);
            }, tag, { caseInsensitive: true });
        });
    } catch (e) {
        console.error("Failed to load magic keys", e);
    }
}
