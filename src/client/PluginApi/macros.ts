import type Client from "@client/Client";
import {
  type ButtonMacroClickContext,
  getButtonMacroById,
  getButtonMacroState,
  type MacroConfigField,
  type MacroState,
  onButtonMacroStateChange,
  type PluginButtonMacro,
  registerButtonMacro,
  setButtonMacroState,
  unregisterButtonMacro,
  updateButtonMacroPluginName,
} from "@modules/core/pluginButtonMacroRegistry";
import {
  type PluginTriggerMacro,
  registerTriggerMacro,
  type TriggerMacroContext,
  unregisterTriggerMacro,
  updateTriggerMacroPluginName,
} from "@modules/core/pluginTriggerMacroRegistry";
import type { MobileButtonSetting } from "@web/buttonSettings";
import type { PluginApiContext } from "./context";

/**
 * Handle returned by buttonMacros.register() for controlling macro state
 */
export interface ButtonMacroHandle {
  /** Get current state ID (for stateful macros) */
  getState(): string | undefined;

  /** Set state by ID (for stateful macros) */
  setState(stateId: string): boolean;

  /** Cycle to next state, wraps around (for stateful macros) */
  cycleState(): void;

  /**
   * Subscribe to state changes
   * @param listener - Callback when state changes
   * @returns Unsubscribe function
   */
  onStateChange(listener: (newState: string, oldState: string | undefined) => void): () => void;
}

/**
 * Button Macros API - Register custom button macros
 *
 * Allows plugins to define custom macros that can be assigned to mobile and desktop buttons.
 * Macros can be stateless (simple click actions) or stateful (toggle/mode buttons).
 */
export interface ButtonMacrosApi {
  /**
   * Register a custom button macro
   *
   * @param options - Macro configuration
   * @param options.id - Unique identifier (will be prefixed with "plugin:")
   * @param options.label - Display label shown in button configuration
   * @param options.onClick - Handler called when button is clicked
   * @param options.configFields - Optional custom configuration fields
   * @param options.states - For stateful macros: array of possible states
   * @param options.initialState - Initial state ID (defaults to first state)
   *
   * @example Simple macro
   * ```typescript
   * api.buttonMacros.register({
   *   id: "myAction",
   *   label: "My Custom Action",
   *   onClick: (button, client, config) => {
   *     client.sendCommand(config.command || "look");
   *   },
   *   configFields: [
   *     { name: "command", type: "text", label: "Command" }
   *   ]
   * });
   * ```
   *
   * @example Stateful toggle macro
   * ```typescript
   * api.buttonMacros.register({
   *   id: "autoHeal",
   *   label: "Auto Heal Toggle",
   *   states: [
   *     { id: "off", label: "OFF", color: "#666666" },
   *     { id: "on", label: "ON", color: "#00ff00" }
   *   ],
   *   initialState: "off",
   *   onClick: (ctx) => {
   *     // ctx.stateCtx is available for stateful macros
   *     ctx.stateCtx.cycleState(); // Toggle to next state
   *     if (ctx.stateCtx.state === "off") {
   *       // Turning on
   *       ctx.client.sendCommand("autoheal on");
   *     } else {
   *       // Turning off
   *       ctx.client.sendCommand("autoheal off");
   *     }
   *   }
   * });
   * ```
   *
   * @example Stateful mode macro
   * ```typescript
   * api.buttonMacros.register({
   *   id: "combatMode",
   *   label: "Combat Mode",
   *   states: [
   *     { id: "defensive", label: "DEF", color: "#0066ff" },
   *     { id: "balanced", label: "BAL", color: "#ffff00" },
   *     { id: "aggressive", label: "AGR", color: "#ff0000" }
   *   ],
   *   onClick: (ctx) => {
   *     ctx.stateCtx.cycleState();
   *     ctx.client.sendCommand(`combat ${ctx.stateCtx.state}`);
   *   }
   * });
   * ```
   */
  register(options: {
    id: string;
    label: string;
    onClick: ((context: ButtonMacroClickContext) => void) | ((button: MobileButtonSetting, client: Client, config: Record<string, any>) => void);
    configFields?: MacroConfigField[];
    states?: MacroState[];
    initialState?: string;
  }): ButtonMacroHandle;

  /**
   * Unregister a previously registered button macro
   * @param id - Macro ID (without "plugin:" prefix)
   */
  unregister(id: string): void;

  /**
   * Get the current state of a stateful macro
   * @param id - Macro ID (without "plugin:" prefix)
   * @returns Current state ID or undefined if not stateful
   *
   * @example
   * ```typescript
   * const state = api.buttonMacros.getState("autoHeal");
   * if (state === "on") {
   *   // Auto-heal is enabled
   * }
   * ```
   */
  getState(id: string): string | undefined;

  /**
   * Set the state of a stateful macro programmatically
   * This will update all buttons using this macro across the UI
   *
   * @param id - Macro ID (without "plugin:" prefix)
   * @param stateId - State ID to set (must be valid for this macro)
   * @returns True if state was set successfully
   *
   * @example
   * ```typescript
   * // Turn off auto-heal programmatically
   * api.buttonMacros.setState("autoHeal", "off");
   * ```
   */
  setState(id: string, stateId: string): boolean;

  /**
   * Subscribe to state changes for a macro
   * Useful for syncing state with game events
   *
   * @param id - Macro ID (without "plugin:" prefix)
   * @param listener - Callback called when state changes
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * // Listen for auto-heal state changes
   * const unsubscribe = api.buttonMacros.onStateChange("autoHeal", (macroType, newState, oldState) => {
   *   console.log(`Auto-heal changed from ${oldState} to ${newState}`);
   * });
   *
   * // Later: stop listening
   * unsubscribe();
   * ```
   */
  onStateChange(id: string, listener: (macroType: string, newState: string, oldState: string | undefined) => void): () => void;
}

/**
 * Trigger Macros API - Register custom trigger macros
 *
 * Allows plugins to define custom macros that can be used in user triggers.
 */
export interface TriggerMacrosApi {
  /**
   * Register a custom trigger macro
   *
   * @param options - Macro configuration
   * @param options.id - Unique identifier (will be prefixed with "plugin:")
   * @param options.label - Display label shown in trigger configuration
   * @param options.onMatch - Handler called when trigger pattern matches
   * @param options.configFields - Optional custom configuration fields
   *
   * @example
   * ```typescript
   * api.triggerMacros.register({
   *   id: "customHighlight",
   *   label: "Custom Highlight",
   *   onMatch: (context) => {
   *     const color = context.config.color || "#ff0000";
   *     context.line.color(context.matchRange, api.colors.fromHex(color));
   *   },
   *   configFields: [
   *     { name: "color", type: "text", label: "Color (hex)", defaultValue: "#ff0000" }
   *   ]
   * });
   * ```
   */
  register(options: {
    id: string;
    label: string;
    onMatch: (context: TriggerMacroContext) => void;
    configFields?: MacroConfigField[];
  }): void;

  /**
   * Unregister a previously registered trigger macro
   * @param id - Macro ID (without "plugin:" prefix)
   */
  unregister(id: string): void;
}

export function createButtonMacrosApi(ctx: PluginApiContext): ButtonMacrosApi {
  const buttonMacroIds = new Set<string>();
  ctx.onCleanup(() => {
    for (const id of Array.from(buttonMacroIds)) unregisterButtonMacro(id);
    buttonMacroIds.clear();
  });
  // Macros registered during init(), before the name was known
  ctx.onRename((name) => updateButtonMacroPluginName(ctx.pluginId, name));
  return {
    register: (options): ButtonMacroHandle => {
      const fullId = `plugin:${ctx.pluginId}:${options.id}`;
      const macro: PluginButtonMacro = {
        id: fullId,
        label: options.label,
        pluginId: ctx.pluginId,
        pluginName: ctx.pluginName,
        onClick: options.onClick,
        configFields: options.configFields,
        states: options.states,
        initialState: options.initialState
      };
      registerButtonMacro(macro);
      buttonMacroIds.add(fullId);

      // Return handle for controlling macro state
      return {
        getState: () => getButtonMacroState(fullId),
        setState: (stateId) => setButtonMacroState(fullId, stateId),
        cycleState: () => {
          const m = getButtonMacroById(fullId);
          if (!m?.states?.length) return;
          const currentState = getButtonMacroState(fullId);
          const currentIndex = m.states.findIndex(s => s.id === currentState);
          const nextIndex = (currentIndex + 1) % m.states.length;
          setButtonMacroState(fullId, m.states[nextIndex].id);
        },
        onStateChange: (listener) => {
          const unsubscribe = onButtonMacroStateChange(fullId, (_, newState, oldState) => {
            listener(newState, oldState);
          });
          ctx.track(unsubscribe);
          return unsubscribe;
        }
      };
    },

    unregister: (id) => {
      const fullId = `plugin:${ctx.pluginId}:${id}`;
      unregisterButtonMacro(fullId);
      buttonMacroIds.delete(fullId);
    },

    getState: (id) => {
      const fullId = `plugin:${ctx.pluginId}:${id}`;
      return getButtonMacroState(fullId);
    },

    setState: (id, stateId) => {
      const fullId = `plugin:${ctx.pluginId}:${id}`;
      return setButtonMacroState(fullId, stateId);
    },

    onStateChange: (id, listener) => {
      const fullId = `plugin:${ctx.pluginId}:${id}`;
      const unsubscribe = onButtonMacroStateChange(fullId, listener);
      ctx.track(unsubscribe);
      return unsubscribe;
    }
  };
}

export function createTriggerMacrosApi(ctx: PluginApiContext): TriggerMacrosApi {
  const triggerMacroIds = new Set<string>();
  ctx.onCleanup(() => {
    for (const id of Array.from(triggerMacroIds)) unregisterTriggerMacro(id);
    triggerMacroIds.clear();
  });
  ctx.onRename((name) => updateTriggerMacroPluginName(ctx.pluginId, name));
  return {
    register: (options) => {
      const fullId = `plugin:${ctx.pluginId}:${options.id}`;
      const macro: PluginTriggerMacro = {
        id: fullId,
        label: options.label,
        pluginId: ctx.pluginId,
        pluginName: ctx.pluginName,
        onMatch: options.onMatch,
        configFields: options.configFields
      };
      registerTriggerMacro(macro);
      triggerMacroIds.add(fullId);
    },

    unregister: (id) => {
      const fullId = `plugin:${ctx.pluginId}:${id}`;
      unregisterTriggerMacro(fullId);
      triggerMacroIds.delete(fullId);
    }
  };
}
