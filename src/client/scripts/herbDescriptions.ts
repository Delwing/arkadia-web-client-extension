import Client from "../Client";
import loadHerbs from "./herbsLoader";
import {findClosestColor} from "@modules/core/Colors";
import {openHerbContextMenu} from "@modules/core/contextMenus";

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
                client.Triggers.registerTokenTrigger(desc, (line) => {
                    const rawLine = line.text;
                    const index = rawLine.indexOf(desc);
                    const suffix = rawLine.substring(index + desc.length);
                    const after = suffix.trimStart();
                    if (after.startsWith("(")) {
                        return line;
                    }
                    const clickable = client.OutputHandler.makeStringRightClickable(id, (ev) => showHerbActions(id, ev)); //TODO fix clickables

                    return line
                        .insert(index + desc.length, " (")
                        .insert(index + desc.length + 2, ")")
                        .insert(index + desc.length + 2, clickable, HERB_NAME_COLOR)

                }, tag, {caseInsensitive: true});
            });
        });
    } catch (e) {
        console.error("Failed to init herb descriptions", e);
    }
}
