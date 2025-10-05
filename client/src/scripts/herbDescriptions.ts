import Client from "../Client";
import loadHerbs from "./herbsLoader";
import {color, RESET, findClosestColor} from "../Colors";
import {stripAnsiCodes} from "../Triggers";

export const HERB_NAME_COLOR = findClosestColor("#ffffff");

export default async function initHerbDescriptions(client: Client) {
    const tag = "herbDescriptions";
    let preUseCommands: string[] = [];
    let postUseCommands: string[] = [];
    client.addEventListener('settings', (ev: CustomEvent) => {
        const st = ev.detail || {};
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
            const actions = herbs.herb_id_to_use[herbId];
            if (!actions || actions.length === 0) return;
            const amounts = [1, 3, 5];
            const items = actions.flatMap(a =>
                amounts.map(n => ({
                    label: `${a.action} ${n}`,
                    action: () => {
                        preUseCommands.forEach(cmd => client.sendCommand(cmd));
                        client.sendCommand(`/zi ${a.action} ${herbId} ${n}`);
                        postUseCommands.forEach(cmd => client.sendCommand(cmd));
                    }
                }))
            );
            client.OutputHandler.showContextMenu(items, ev.pageX, ev.pageY);
        };
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
                    const clickable = client.OutputHandler.makeStringRightClickable(id, (ev) => showHerbActions(id, ev));
                    return prefix + token + ` (${color(HERB_NAME_COLOR)}${clickable}${RESET})` + suffix;
                }, tag, {caseInsensitive: true});
            });
        });
    } catch (e) {
        console.error("Failed to init herb descriptions", e);
    }
}
