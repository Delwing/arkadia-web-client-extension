import Client from "../Client";
import loadHerbs from "./herbsLoader";
import { color, RESET, findClosestColor } from "../Colors";
import { stripAnsiCodes } from "../Triggers";

export const HERB_NAME_COLOR = findClosestColor("#ffffff");

export default async function initHerbDescriptions(client: Client) {
    const tag = "herbDescriptions";
    try {
        const herbs = await loadHerbs();
        if (!herbs) return;
        Object.entries(herbs.herb_id_to_odmiana).forEach(([id, forms]) => {
            Object.values(forms).forEach(desc => {
                client.Triggers.registerTokenTrigger(desc, (raw, _line, m) => {
                    const index = m.index || 0;
                    const token = m[0];
                    const prefix = raw.substring(0, index);
                    const suffix = raw.substring(index + token.length);
                    const after = stripAnsiCodes(suffix).trimStart();
                    if (after.startsWith("(")) {
                        return raw;
                    }
                    return prefix + token + ` (${color(HERB_NAME_COLOR)}${id}${RESET})` + suffix;
                }, tag);
            });
        });
    } catch (e) {
        console.error("Failed to init herb descriptions", e);
    }
}
