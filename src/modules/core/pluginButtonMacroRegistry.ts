import type Client from "@client/Client";
import type { MobileButtonSetting, DesktopButtonSetting } from "@web/buttonSettings";
import eventBus from "./eventBus";

// Union type for button settings from both mobile and desktop
export type AnyButtonSetting = MobileButtonSetting | DesktopButtonSetting;

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
    button: AnyButtonSetting;
    client: Client;
    config: Record<string, any>;
    /** State context - only present for stateful macros */
    stateCtx?: MacroStateContext;
}

export interface PluginButtonMacro {
    id: string;
    label: string;
    pluginId: string;
    /** Plugin display name (if available) */
    pluginName?: string;
    /**
     * Click handler - receives full context object
     * For backwards compatibility, also supports (button, client, config) signature
     */
    onClick: ((context: ButtonMacroClickContext) => void) | ((button: MobileButtonSetting, client: Client, config: Record<string, any>) => void);
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

// Global state storage - state is shared across all buttons with the same macro type
const globalMacroState = new Map<string, string>();

// State change listeners
type StateChangeListener = (macroType: string, newState: string, oldState: string | undefined) => void;
const stateChangeListeners = new Map<string, Set<StateChangeListener>>();

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

export function updateButtonMacroPluginName(pluginId: string, pluginName: string): void {
    let changed = false;
    for (const macro of registeredMacros.values()) {
        if (macro.pluginId === pluginId && macro.pluginName !== pluginName) {
            macro.pluginName = pluginName;
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
 * Get the current state for a stateful macro (shared across all buttons with same macro type)
 */
export function getButtonMacroState(macroType: string): string | undefined {
    const macro = registeredMacros.get(macroType);
    if (!macro?.states || macro.states.length === 0) {
        return undefined;
    }

    const currentState = globalMacroState.get(macroType);
    // Validate the state exists, fallback to initial or first state
    if (currentState && macro.states.some(s => s.id === currentState)) {
        return currentState;
    }
    return macro.initialState || macro.states[0].id;
}

/**
 * Set the state for a stateful macro (affects all buttons with this macro type)
 * Emits state change event so all buttons can update
 */
export function setButtonMacroState(macroType: string, newStateId: string): boolean {
    const macro = registeredMacros.get(macroType);
    if (!macro?.states || macro.states.length === 0) {
        return false;
    }

    if (!macro.states.some(s => s.id === newStateId)) {
        console.warn(`Invalid state ${newStateId} for macro ${macroType}`);
        return false;
    }

    const oldState = globalMacroState.get(macroType);
    if (oldState === newStateId) {
        return true; // No change needed
    }

    globalMacroState.set(macroType, newStateId);

    // Notify listeners
    const listeners = stateChangeListeners.get(macroType);
    if (listeners) {
        for (const listener of listeners) {
            try {
                listener(macroType, newStateId, oldState);
            } catch (e) {
                console.error(`Error in state change listener for ${macroType}:`, e);
            }
        }
    }

    // Emit global event for UI updates
    eventBus.emit('pluginButtonMacroStateChanged', { macroType, newState: newStateId, oldState });

    return true;
}

/**
 * Subscribe to state changes for a specific macro type
 * Returns unsubscribe function
 */
export function onButtonMacroStateChange(
    macroType: string,
    listener: (macroType: string, newState: string, oldState: string | undefined) => void
): () => void {
    if (!stateChangeListeners.has(macroType)) {
        stateChangeListeners.set(macroType, new Set());
    }
    stateChangeListeners.get(macroType)!.add(listener);

    return () => {
        const listeners = stateChangeListeners.get(macroType);
        if (listeners) {
            listeners.delete(listener);
            if (listeners.size === 0) {
                stateChangeListeners.delete(macroType);
            }
        }
    };
}

/**
 * Custom state overrides from user config
 */
export interface CustomStateOverrides {
    labels?: Record<string, string>;
    colors?: Record<string, string>;
}

/**
 * Get display info (stateLabel, color) for a stateful macro based on current state
 * Returns stateLabel separately so it can be combined with user label: "userLabel stateLabel"
 * @param macroType - The macro type ID
 * @param customOverrides - Optional custom labels/colors from user config
 */
export function getButtonMacroDisplayInfo(
    macroType: string,
    customOverrides?: CustomStateOverrides
): { stateLabel?: string; color?: string } | undefined {
    const macro = registeredMacros.get(macroType);
    if (!macro?.states || macro.states.length === 0) {
        return undefined;
    }

    const currentStateId = getButtonMacroState(macroType);
    const currentState = macro.states.find(s => s.id === currentStateId);

    if (currentState) {
        // Use custom label/color if provided, otherwise use default from macro registration
        const customLabel = customOverrides?.labels?.[currentStateId];
        const customColor = customOverrides?.colors?.[currentStateId];
        return {
            stateLabel: customLabel || currentState.label,
            color: customColor || currentState.color
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
    button: AnyButtonSetting,
    client: Client,
    config: Record<string, any> = {}
): boolean {
    const macro = registeredMacros.get(macroType);
    if (!macro) {
        return false;
    }
    try {
        // Check if this is a stateful macro
        if (macro.states && macro.states.length > 0) {
            const currentStateId = getButtonMacroState(macroType) || macro.states[0].id;
            const currentStateIndex = macro.states.findIndex(s => s.id === currentStateId);

            const setState = (newStateId: string) => {
                setButtonMacroState(macroType, newStateId);
            };

            const cycleState = () => {
                const nextIndex = (currentStateIndex + 1) % macro.states!.length;
                const nextStateId = macro.states![nextIndex].id;
                setButtonMacroState(macroType, nextStateId);
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
                (macro.onClick as (button: AnyButtonSetting, client: Client, config: Record<string, any>) => void)(button, client, config);
            }
        }
        return true;
    } catch (e) {
        console.error(`Error executing plugin button macro ${macroType}:`, e);
        return false;
    }
}
