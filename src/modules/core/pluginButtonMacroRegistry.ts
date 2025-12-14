import type Client from "@client/Client";
import type { ButtonSetting } from "@web/mobileButtonSettings";
import eventBus from "./eventBus";

export interface MacroConfigField {
    name: string;
    type: 'text' | 'textarea' | 'number' | 'select' | 'checkbox';
    label: string;
    options?: { value: string; label: string }[];
    defaultValue?: string | number | boolean;
}

/**
 * Defines a state for stateful macros (toggle/mode buttons)
 */
export interface MacroState {
    id: string;
    label: string;
    color?: string;
}

/**
 * Context passed to stateful macro onClick handlers
 */
export interface MacroStateContext {
    /** Current state ID */
    state: string;
    /** Set a new state by ID */
    setState: (stateId: string) => void;
    /** Cycle to the next state (wraps around) */
    cycleState: () => void;
    /** Get the index of current state */
    stateIndex: number;
}

/**
 * Combined context for onClick handler
 */
export interface ButtonMacroClickContext {
    button: ButtonSetting;
    client: Client;
    config: Record<string, any>;
    /** State context - only present for stateful macros */
    stateCtx?: MacroStateContext;
}

export interface PluginButtonMacro {
    id: string;
    label: string;
    pluginId: string;
    /**
     * Click handler - receives full context object
     * For backwards compatibility, also supports (button, client, config) signature
     */
    onClick: ((context: ButtonMacroClickContext) => void) | ((button: ButtonSetting, client: Client, config: Record<string, any>) => void);
    configFields?: MacroConfigField[];
    /**
     * For stateful macros: array of possible states
     * If defined, the macro becomes stateful and onClick receives stateCtx
     */
    states?: MacroState[];
    /**
     * Initial state ID (must match one of the states[].id)
     * Defaults to first state if not specified
     */
    initialState?: string;
}

const registeredMacros = new Map<string, PluginButtonMacro>();

export function registerButtonMacro(macro: PluginButtonMacro): void {
    if (registeredMacros.has(macro.id)) {
        unregisterButtonMacro(macro.id);
    }
    registeredMacros.set(macro.id, macro);
    eventBus.emit('pluginButtonMacrosChanged');
}

export function unregisterButtonMacro(id: string): void {
    if (registeredMacros.delete(id)) {
        eventBus.emit('pluginButtonMacrosChanged');
    }
}

export function unregisterButtonMacrosByPlugin(pluginId: string): void {
    let changed = false;
    for (const [id, macro] of registeredMacros) {
        if (macro.pluginId === pluginId) {
            registeredMacros.delete(id);
            changed = true;
        }
    }
    if (changed) {
        eventBus.emit('pluginButtonMacrosChanged');
    }
}

export function getRegisteredButtonMacros(): PluginButtonMacro[] {
    return Array.from(registeredMacros.values());
}

export function getButtonMacroById(id: string): PluginButtonMacro | undefined {
    return registeredMacros.get(id);
}

export function isButtonMacroAvailable(macroType: string): boolean {
    if (!macroType.startsWith('plugin:')) {
        return true;
    }
    return registeredMacros.has(macroType);
}

/**
 * Get the current state for a stateful macro button
 * State is stored in pluginConfig.__state
 */
export function getButtonMacroState(
    macroType: string,
    config: Record<string, any>
): string | undefined {
    const macro = registeredMacros.get(macroType);
    if (!macro?.states || macro.states.length === 0) {
        return undefined;
    }

    const currentState = config.__state as string | undefined;
    // Validate the state exists, fallback to initial or first state
    if (currentState && macro.states.some(s => s.id === currentState)) {
        return currentState;
    }
    return macro.initialState || macro.states[0].id;
}

/**
 * Get display info (label, color) for a stateful macro based on current state
 */
export function getButtonMacroDisplayInfo(
    macroType: string,
    config: Record<string, any>
): { label?: string; color?: string } | undefined {
    const macro = registeredMacros.get(macroType);
    if (!macro?.states || macro.states.length === 0) {
        return undefined;
    }

    const currentStateId = getButtonMacroState(macroType, config);
    const currentState = macro.states.find(s => s.id === currentStateId);

    if (currentState) {
        return {
            label: currentState.label,
            color: currentState.color
        };
    }
    return undefined;
}

/**
 * Check if a macro is stateful (has states defined)
 */
export function isStatefulMacro(macroType: string): boolean {
    const macro = registeredMacros.get(macroType);
    return !!(macro?.states && macro.states.length > 0);
}

/**
 * Get available states for a macro
 */
export function getMacroStates(macroType: string): MacroState[] | undefined {
    const macro = registeredMacros.get(macroType);
    return macro?.states;
}

export function executeButtonMacro(
    macroType: string,
    button: ButtonSetting,
    client: Client,
    config: Record<string, any> = {},
    onStateChange?: (newState: string) => void
): boolean {
    const macro = registeredMacros.get(macroType);
    if (!macro) {
        return false;
    }
    try {
        // Check if this is a stateful macro
        if (macro.states && macro.states.length > 0) {
            const currentStateId = getButtonMacroState(macroType, config) || macro.states[0].id;
            const currentStateIndex = macro.states.findIndex(s => s.id === currentStateId);

            const setState = (newStateId: string) => {
                if (macro.states!.some(s => s.id === newStateId)) {
                    onStateChange?.(newStateId);
                } else {
                    console.warn(`Invalid state ${newStateId} for macro ${macroType}`);
                }
            };

            const cycleState = () => {
                const nextIndex = (currentStateIndex + 1) % macro.states!.length;
                const nextStateId = macro.states![nextIndex].id;
                onStateChange?.(nextStateId);
            };

            const stateCtx: MacroStateContext = {
                state: currentStateId,
                setState,
                cycleState,
                stateIndex: currentStateIndex
            };

            const context: ButtonMacroClickContext = {
                button,
                client,
                config,
                stateCtx
            };

            // Call with context object
            (macro.onClick as (context: ButtonMacroClickContext) => void)(context);
        } else {
            // Non-stateful macro - try context style first, fallback to legacy
            const context: ButtonMacroClickContext = { button, client, config };
            // Check if it's a context-style handler (single argument) or legacy (3 arguments)
            if (macro.onClick.length <= 1) {
                (macro.onClick as (context: ButtonMacroClickContext) => void)(context);
            } else {
                (macro.onClick as (button: ButtonSetting, client: Client, config: Record<string, any>) => void)(button, client, config);
            }
        }
        return true;
    } catch (e) {
        console.error(`Error executing plugin button macro ${macroType}:`, e);
        return false;
    }
}
