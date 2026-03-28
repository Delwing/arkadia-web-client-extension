import Client from "@client/Client";
import type { ButtonMacroConfig } from "../buttonSettings";
import {
    executeButtonMacro,
    type AnyButtonSetting,
} from "@modules/core/pluginButtonMacroRegistry";

export interface MacroExecutorCallbacks {
    toggleList?: (macroType: string) => void;
    toggleVisibility?: () => void;
    updateMoveModeButton?: (btn: HTMLButtonElement) => void;
    getFunctionalBinding?: () => { key: string; ctrl: boolean; alt: boolean; shift: boolean } | null;
}

/**
 * Shared macro execution logic for both mobile and desktop buttons.
 * UI-specific behavior (list rendering, visibility toggling, moveMode label updates)
 * is handled through callbacks provided by each button implementation.
 */
export function executeMacro(
    client: Client,
    macroType: string,
    config: ButtonMacroConfig,
    callbacks?: MacroExecutorCallbacks,
    btn?: HTMLButtonElement,
) {
    // Handle plugin macros
    if (macroType.startsWith('plugin:')) {
        executeButtonMacro(macroType, config as AnyButtonSetting, client, config.pluginConfig || {});
        return;
    }

    switch (macroType) {
        case 'empty':
            break;
        case 'functional': {
            const binding = callbacks?.getFunctionalBinding?.();
            if (binding) {
                const event = new KeyboardEvent('keydown', {
                    code: binding.key,
                    key: binding.key,
                    ctrlKey: binding.ctrl,
                    altKey: binding.alt,
                    shiftKey: binding.shift,
                    bubbles: true,
                    cancelable: true
                });
                document.dispatchEvent(event);
            }
            break;
        }
        case 'command':
            if (config.command) {
                const commands = config.command.split('\n').filter(cmd => cmd.trim());
                for (const cmd of commands) {
                    client.sendCommand(cmd.trim());
                }
            }
            break;
        case 'kierunek':
            if (config.command) {
                client.sendCommand(config.command);
            } else if (config.direction) {
                client.sendCommand(config.direction);
            }
            break;
        case 'specialExit': {
            const specialExits = client.Map.currentRoom?.specialExits ?? {};
            const firstExit = Object.keys(specialExits)[0];
            if (firstExit) {
                client.sendCommand(firstExit);
            }
            break;
        }
        case 'wesprzyj':
            client.support();
            break;
        case 'moveMode':
            if (!client.carriageMode && btn) {
                const isLeader = !!client.TeamManager?.isLeader?.();
                const options = isLeader ? 3 : 2;
                client.moveMode = (client.moveMode + 1) % options;
                callbacks?.updateMoveModeButton?.(btn);
                client.sendEvent('moveModeChanged', client.moveMode);
            }
            break;
        case 'toggleButtons':
            callbacks?.toggleVisibility?.();
            break;
        case 'zList':
        case 'zaList':
        case 'wList':
        case 'przeList':
        case 'idzList':
            callbacks?.toggleList?.(macroType);
            break;
        case 'attackEnemy':
            client.attackEnemySlot(config.enemySlot ?? 0);
            break;
        case 'blockEnemy':
            client.blockEnemySlot(config.enemySlot ?? 0);
            break;
        case 'attackAllEnemies':
            client.attackAllEnemies();
            break;
        case 'mute':
            client.SoundManager.mute();
            break;
        case 'unmute':
            client.SoundManager.unmute();
            break;
        case 'compound':
            if (config.steps) {
                for (const step of config.steps) {
                    executeMacro(client, step.macroType, step, callbacks, btn);
                }
            }
            break;
    }
}
