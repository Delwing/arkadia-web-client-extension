import Client from "../Client";
import loadHerbs from "./herbsLoader";
import {createColorFormat} from "@modules/core/Colors";
import {openHerbContextMenu} from "@modules/core/contextMenus";

export const HERB_NAME_COLOR = createColorFormat("#ffffff");

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
                    const index = rawLine.toLowerCase().indexOf(desc.toLowerCase());
                    const suffix = rawLine.substring(index + desc.length);
                    const after = suffix.trimStart();
                    if (after.startsWith("(")) {
                        return line;
                    }

                    line.insert(index + desc.length, " (")
                        .insert(index + desc.length + 2, id, HERB_NAME_COLOR)
                        .insert(index + desc.length + 2 + id.length, ")")

                    // Create link for the herb ID
                    const idStart = index + desc.length + 2;
                    line.createLink([idStart, idStart + id.length], {
                        onContextMenu: (ev) => {
                            ev.preventDefault();
                            showHerbActions(id, ev);
                        },
                        title: `Prawy klik dla opcji: ${id}`
                    });

                    return line;
                }, tag, {caseInsensitive: true});
            });
        });
    } catch (e) {
        console.error("Failed to init herb descriptions", e);
    }
}
