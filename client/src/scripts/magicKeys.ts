import Client from "../Client";
import {colorTokenInLine, findClosestColor} from "../Colors";
import {dataCatalog} from "../dataCatalog/catalogInstance";

export const KEYS_COLOR = findClosestColor("#00ff7f");
export default async function initMagicKeys(client: Client) {
    const tag = "magicKeys";
    dataCatalog.getMagicKeysStore().getData().then(keys => {
        keys.magic_keys.forEach((pattern: string) => {
            client.Triggers.registerTokenTrigger(pattern, (raw) => {
                return colorTokenInLine(raw, pattern, KEYS_COLOR);
            }, tag, {caseInsensitive: true});
        });
    }).catch(e => {
        console.error("Failed to load magic keys", e);
    })
}

