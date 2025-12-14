import type Client from "@client/Client";
import type { AnsiAwareBuffer, TextRange } from "@client/ansi/FormatState";
import type { MacroConfigField } from "./pluginButtonMacroRegistry";
import eventBus from "./eventBus";

export type { MacroConfigField };

export interface TriggerMacroContext {
    client: Client;
    line: AnsiAwareBuffer;
    match: RegExpMatchArray;
    matchRange: TextRange;
    config: Record<string, any>;
}

export interface PluginTriggerMacro {
    id: string;
    label: string;
    pluginId: string;
    onMatch: (context: TriggerMacroContext) => void;
    configFields?: MacroConfigField[];
}

const registeredMacros = new Map<string, PluginTriggerMacro>();

export function registerTriggerMacro(macro: PluginTriggerMacro): void {
    if (registeredMacros.has(macro.id)) {
        unregisterTriggerMacro(macro.id);
    }
    registeredMacros.set(macro.id, macro);
    eventBus.emit('pluginTriggerMacrosChanged');
}

export function unregisterTriggerMacro(id: string): void {
    if (registeredMacros.delete(id)) {
        eventBus.emit('pluginTriggerMacrosChanged');
    }
}

export function unregisterTriggerMacrosByPlugin(pluginId: string): void {
    let changed = false;
    for (const [id, macro] of registeredMacros) {
        if (macro.pluginId === pluginId) {
            registeredMacros.delete(id);
            changed = true;
        }
    }
    if (changed) {
        eventBus.emit('pluginTriggerMacrosChanged');
    }
}

export function getRegisteredTriggerMacros(): PluginTriggerMacro[] {
    return Array.from(registeredMacros.values());
}

export function getTriggerMacroById(id: string): PluginTriggerMacro | undefined {
    return registeredMacros.get(id);
}

export function isTriggerMacroAvailable(macroType: string): boolean {
    if (!macroType.startsWith('plugin:')) {
        return true;
    }
    return registeredMacros.has(macroType);
}

export function executeTriggerMacro(
    macroType: string,
    context: Omit<TriggerMacroContext, 'config'>,
    config: Record<string, any> = {}
): boolean {
    const macro = registeredMacros.get(macroType);
    if (!macro) {
        return false;
    }
    try {
        macro.onMatch({ ...context, config });
        return true;
    } catch (e) {
        console.error(`Error executing plugin trigger macro ${macroType}:`, e);
        return false;
    }
}
