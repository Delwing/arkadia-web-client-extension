import Client from "../Client";
import {colorTokenInLine} from "@modules/core/Colors";
import loadMagics from "./lib/magicsLoader";
import { getMagicsColorFormat } from "./prettyContainers";

export default async function initMagics(client: Client) {
    const tag = "magics";
    try {
        const magics = await loadMagics();
        magics.forEach((pattern: string) => {
            client.Triggers.registerTokenTrigger(pattern, (line) => {
                return colorTokenInLine(line, pattern, getMagicsColorFormat());
            }, tag, {caseInsensitive: true});
        });
    } catch (e) {
        console.error("Failed to load magics", e);
    }
}
