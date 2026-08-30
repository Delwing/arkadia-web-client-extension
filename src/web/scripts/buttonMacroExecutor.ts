import Client from "@client/Client";
import type { ButtonMacroConfig } from "../buttonSettings";
import {
    executeButtonMacro,
    type AnyButtonSetting,
} from "@modules/core/pluginButtonMacroRegistry";
import { carriageStopFor } from "@client/scripts/directionBinds";
export const MOVE_MODE_LABELS = ["zwykly", "prz", "prz dr"];
export const MOVE_MODE_TITLES = ["zwykly", "przemknij", "przemknij z druzyna"];

export function updateMoveModeLabel(button: HTMLButtonElement, mode: number) {
    const prefix = button.dataset.moveModeLabel ?? '';
    const label = prefix ? `${prefix} ${MOVE_MODE_LABELS[mode]}` : MOVE_MODE_LABELS[mode];
    const title = prefix ? `${prefix} ${MOVE_MODE_TITLES[mode]}` : MOVE_MODE_TITLES[mode];
    button.textContent = label;
    button.title = title;
}

export interface MacroExecutorCallbacks {
    toggleList?: (macroType: string) => void;
    toggleVisibility?: () => void;
    updateMoveModeButton?: (btn: HTMLButtonElement) => void;
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
        case 'functional':
            client.sendEvent('executeFunctionalBind');
            break;
        case 'command':
            if (config.command) {
                const commands = config.command.split('\n').filter(cmd => cmd.trim());
                for (const cmd of commands) {
                    // A "zerknij" button halts the carriage mid-ride, same as the numpad key.
                    client.sendCommand(carriageStopFor(client, cmd) ?? cmd.trim());
                }
            }
            break;
        case 'kierunek': {
            const command = config.command || config.direction;
            if (command) {
                client.sendCommand(carriageStopFor(client, command) ?? command);
            }
            break;
        }
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
                    // Merge step macro fields onto the parent button config so plugin
                    // handlers still receive full button metadata (id, label, color, etc.)
                    const stepConfig = { ...config, ...step, steps: step.steps };
                    executeMacro(client, step.macroType, stepConfig, callbacks, btn);
                }
            }
            break;
    }
}
