import Client from "../Client";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";

export default function initDobOp(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const commands = {
        dob: ['', '', ''] as [string, string, string],
        op: ['', '', ''] as [string, string, string],
    };

    const applySettings = (settings: any) => {
        const st = (settings ?? defaultSettings) as any;
        commands.dob[0] = typeof st.dobCommand1 === 'string' ? st.dobCommand1 : '';
        commands.dob[1] = typeof st.dobCommand2 === 'string' ? st.dobCommand2 : '';
        commands.dob[2] = typeof st.dobCommand3 === 'string' ? st.dobCommand3 : '';
        commands.op[0] = typeof st.opCommand1 === 'string' ? st.opCommand1 : '';
        commands.op[1] = typeof st.opCommand2 === 'string' ? st.opCommand2 : '';
        commands.op[2] = typeof st.opCommand3 === 'string' ? st.opCommand3 : '';
    };
    applySettings(characterStorage.get('settings'));
    client.scope.onDispose(characterStorage.onChange('settings', (settings) => {
        applySettings(settings);
    }));

    async function runSlot(cmds: string) {
        const parts = cmds.split(';').map(c => c.trim()).filter(Boolean);
        for (const part of parts) {
            await client.sendCommand(part);
        }
    }

    async function runSlots(type: 'dob' | 'op', slots: number[]) {
        for (const slot of slots) {
            const cmd = commands[type][slot];
            if (cmd) {
                await runSlot(cmd);
            }
        }
    }

    if (aliases) {
        aliases.push({
            pattern: /^\/dob$/,
            callback: () => runSlots('dob', [0, 1]),
        });

        aliases.push({
            pattern: /^\/dob ([1-3])$/,
            callback: (matches: RegExpMatchArray) => {
                const slot = parseInt(matches[1], 10) - 1;
                runSlots('dob', [slot]);
            },
        });

        aliases.push({
            pattern: /^\/op$/,
            callback: () => runSlots('op', [0, 1]),
        });

        aliases.push({
            pattern: /^\/op ([1-3])$/,
            callback: (matches: RegExpMatchArray) => {
                const slot = parseInt(matches[1], 10) - 1;
                runSlots('op', [slot]);
            },
        });
    }
}
