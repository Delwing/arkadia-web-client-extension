import type Client from "./Client";
import type { CommandOptions } from "./scripts/commandPreserveCaseMode";
import { stripPolishCharacters } from "./stripPolishCharacters";
import { mudletColorLine } from "@modules/core/Colors";
import { AliasList } from "./AliasList";

export type CommandHookCallback = (
    command: string,
    echo: boolean,
    options?: CommandOptions
) => string | null | undefined;

export interface CommandHook {
    id: string;
    callback: CommandHookCallback;
    priority: number;
}

export default class CommandProcessor {
    aliases: AliasList = new AliasList();
    private commandHooks: CommandHook[] = [];
    private client: Client;

    constructor(client: Client) {
        this.client = client;
    }

    async sendCommand(command: string, echo: boolean = true, options?: CommandOptions, skipMapParse: boolean = false, fromUserInput: boolean = false): Promise<void> {
        for (const hook of this.commandHooks) {
            const result = hook.callback(command, echo, options);
            if (result === null) {
                return;
            }
            if (result !== undefined) {
                command = result;
            }
        }

        if (command) {
            command = stripPolishCharacters(command);
        }

        let commandChanged = false;
        if (!skipMapParse) {
            const parsedCommand = this.client.Map.parseCommand(command);
            if (parsedCommand === null) {
                return;
            }
            commandChanged = parsedCommand !== command;
            command = parsedCommand;
        }
        command = this.expandObjectShortcuts(command);
        if (command.startsWith('echo ')) {
            this.client.print(mudletColorLine(command.substring(5)));
            return;
        }
        const split = command.split((fromUserInput && !commandChanged) ? /;/ : /[#;]/);
        if (split.length > 1) {
            for (const part of split) {
                await this.sendCommand(part, echo, options, skipMapParse || commandChanged);
            }
            return;
        }

        for (const alias of this.aliases.forCommand(command)) {
            const matches = command.match(alias.pattern);
            if (matches) {
                const result = alias.callback(matches);
                if (result && typeof (result as Promise<unknown>).then === 'function') {
                    await result;
                }
                return;
            }
        }

        if (command.startsWith('/') && command.match(/^\/\w+/)) {
            this.client.print(mudletColorLine(`--- <tomato>Nieznany alias<reset>: ${command}`));
            return;
        }
        this.client.sendEvent('command', command);
        this.client.movementManager.sendMovement(command, echo, options);
    }

    registerCommandHook(id: string, callback: CommandHookCallback, priority: number = 0): void {
        this.unregisterCommandHook(id);
        this.commandHooks.push({ id, callback, priority });
        this.commandHooks.sort((a, b) => b.priority - a.priority);
    }

    unregisterCommandHook(id: string): boolean {
        const index = this.commandHooks.findIndex(h => h.id === id);
        if (index !== -1) {
            this.commandHooks.splice(index, 1);
            return true;
        }
        return false;
    }

    private expandObjectShortcuts(command: string): string {
        return command.replace(/@([A-Za-z0-9@]+)/g, (match, short) => {
            const obj = this.client.ObjectManager.getObjectsOnLocation().find(
                o => o.shortcut?.toLowerCase() === short.toLowerCase()
            );
            return obj ? `ob_${obj.num}` : match;
        });
    }
}
