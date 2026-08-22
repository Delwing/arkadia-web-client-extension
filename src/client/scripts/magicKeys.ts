import Client from "../Client";
import {colorTokenInLine} from "@modules/core/Colors";
import loadMagicKeys from "./lib/magicKeyLoader";
import { getMagicKeysColorFormat } from "./prettyContainers";

export default async function initMagicKeys(client: Client) {
    const tag = "magicKeys";
    try {
        const keys = await loadMagicKeys();
        keys.forEach((pattern: string) => {
            client.Triggers.registerTokenTrigger(pattern, (line) => {
                return colorTokenInLine(line, pattern, getMagicKeysColorFormat());
            }, tag, { caseInsensitive: true });
        });
    } catch (e) {
        console.error("Failed to load magic keys", e);
    }
}
