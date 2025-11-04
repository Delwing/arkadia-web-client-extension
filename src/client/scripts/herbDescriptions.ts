import Client from "../Client";
import loadHerbs from "./herbsLoader";
import {color, RESET, findClosestColor} from "@modules/core/Colors";
import { openHerbContextMenu } from "@modules/core/contextMenus";

export const HERB_NAME_COLOR = findClosestColor("#ffffff");

export default async function initHerbDescriptions(client: Client) {
    const tag = "herbDescriptions";
    let preUseCommands: string[] = [];
    let postUseCommands: string[] = [];
    client.on('settings', (settings) => {
        const st = (settings ?? {}) as { herbPreUseCommand?: string; herbPostUseCommand?: string };
        preUseCommands = typeof st.herbPreUseCommand === 'string'
            ? st.herbPreUseCommand.split(';').map((c: string) => c.trim()).filter(Boolean)
            : [];
        postUseCommands = typeof st.herbPostUseCommand === 'string'
            ? st.herbPostUseCommand.split(';').map((c: string) => c.trim()).filter(Boolean)
            : [];
    });
    try {
        const herbs = await loadHerbs();
        if (!herbs) return;

        const showHerbActions = (herbId: string, ev: MouseEvent) => {
            openHerbContextMenu(client, {
                herbId,
                actions: herbs.herb_id_to_use[herbId],
                x: ev.pageX,
                y: ev.pageY,
                commandPrefix: '/zi',
                preUseCommands,
                postUseCommands,
            });
        };
        Object.entries(herbs.herb_id_to_odmiana).forEach(([id, forms]) => {
            Object.values(forms).forEach(desc => {
                client.Triggers.registerTokenTrigger(desc, (triggerLine) => {
                    const m = triggerLine.matches.matches;
                    if (!m) return triggerLine;
                    const line = triggerLine.text;
                    const index = m.index ?? 0;
                    const token = m[0];
                    const suffix = line.substring(index + token.length);
                    const after = suffix.trimStart();
                    if (after.startsWith("(")) {
                        return triggerLine;
                    }
                    const clickable = client.OutputHandler.makeStringRightClickable(id, (ev) => showHerbActions(id, ev));
                    const insertion = ` (${color(HERB_NAME_COLOR)}${clickable}${RESET})`;
                    triggerLine.insert(index + token.length, insertion);
                    return triggerLine;
                }, tag, {caseInsensitive: true});
            });
        });
    } catch (e) {
        console.error("Failed to init herb descriptions", e);
    }
}
