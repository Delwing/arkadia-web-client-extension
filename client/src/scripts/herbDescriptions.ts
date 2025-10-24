import Client from "../Client";
import loadHerbs from "./herbsLoader";
import {color, RESET, findClosestColor} from "../Colors";
import { openHerbContextMenu } from "../contextMenus";
import type { FormatStateSnapshot } from "../ansi/FormatState";
import { cloneFormatState } from "../ansi/FormatState";
import TriggerLine from "../triggers/TriggerLine";

export const HERB_NAME_COLOR = findClosestColor("#ffffff");

function inferStyleAt(line: TriggerLine | undefined, index: number): FormatStateSnapshot | undefined {
    if (!line) {
        return undefined;
    }
    const buffer = (line as unknown as { buffer?: { inferState?: (i: number) => FormatStateSnapshot | undefined } }).buffer;
    if (!buffer || typeof buffer.inferState !== "function") {
        return undefined;
    }
    try {
        const state = buffer.inferState(index);
        return state ? cloneFormatState(state) : undefined;
    } catch {
        return undefined;
    }
}

function styleToAnsi(style?: FormatStateSnapshot): string {
    if (!style) {
        return "";
    }
    const codes: number[] = [];
    if (style.bold) codes.push(1);
    if (style.italic) codes.push(3);
    if (style.underline) codes.push(4);
    if (style.inverse) codes.push(7);
    if (style.strikethrough) codes.push(9);
    const fg = style.foreground;
    if (fg && fg.space === "indexed") {
        if (fg.index >= 0 && fg.index <= 7) {
            codes.push(30 + fg.index);
        } else if (fg.index >= 8 && fg.index <= 15) {
            codes.push(90 + (fg.index - 8));
        } else {
            codes.push(38, 5, fg.index);
        }
    }
    if (fg && fg.space === "rgb") {
        codes.push(38, 2, fg.r, fg.g, fg.b);
    }
    const bg = style.background;
    if (bg && bg.space === "indexed") {
        if (bg.index >= 0 && bg.index <= 7) {
            codes.push(40 + bg.index);
        } else if (bg.index >= 8 && bg.index <= 15) {
            codes.push(100 + (bg.index - 8));
        } else {
            codes.push(48, 5, bg.index);
        }
    }
    if (bg && bg.space === "rgb") {
        codes.push(48, 2, bg.r, bg.g, bg.b);
    }
    if (codes.length === 0) {
        return "";
    }
    return `\x1B[${codes.join(";")}m`;
}

function inferStyleFromRaw(line: string, index: number): FormatStateSnapshot | undefined {
    try {
        const triggerLine = new TriggerLine(line);
        return inferStyleAt(triggerLine, index);
    } catch {
        return undefined;
    }
}

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
                client.Triggers.registerTokenTrigger(desc, (raw, line, m, _type, triggerLine) => {
                    const index = m.index ?? 0;
                    const token = m[0];
                    const suffix = line.substring(index + token.length);
                    const after = suffix.trimStart();
                    if (after.startsWith("(")) {
                        return raw;
                    }
                    const clickable = client.OutputHandler.makeStringRightClickable(id, (ev) => showHerbActions(id, ev));
                    const insertIndex = index + token.length;
                    const baseStyle = triggerLine ? inferStyleAt(triggerLine, insertIndex) : undefined;
                    const insertion = ` (${color(HERB_NAME_COLOR)}${clickable}${RESET}${styleToAnsi(baseStyle)})`;
                    if (triggerLine) {
                        triggerLine.insert(insertIndex, insertion);
                        return triggerLine;
                    }
                    const restoreAnsi = styleToAnsi(inferStyleFromRaw(line, insertIndex));
                    const insertionWithoutTrigger = ` (${color(HERB_NAME_COLOR)}${clickable}${RESET}${restoreAnsi})`;
                    return line.substring(0, insertIndex) + insertionWithoutTrigger + suffix;
                }, tag, {caseInsensitive: true});
            });
        });
    } catch (e) {
        console.error("Failed to init herb descriptions", e);
    }
}
