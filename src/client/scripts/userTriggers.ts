import Client from "../Client";
import {createColorFormat} from "@modules/core/Colors";
import {AnsiAwareBuffer, TextRange, DimEasing} from "@client/ansi/FormatState";
import {Trigger} from "../Triggers";
import {executeTriggerMacro} from "@modules/core/pluginTriggerMacroRegistry";
import { globalStorage } from "@modules/core/storage";

export type BuiltInMacroType = 'uppercase' | 'color' | 'replace' | 'beep' | 'mute' | 'unmute' | 'command' | 'slowBlink' | 'rapidBlink' | 'dim' | 'functionalBind' | 'wrap' | 'notify';

export interface UserMacro {
    type: BuiltInMacroType | string;  // string allows plugin macros like "plugin:..."
    color?: string;
    to?: string;
    command?: string;
    soundKey?: string;
    label?: string;
    message?: string;  // notification text (notify); empty falls back to matched text for pattern triggers
    pluginConfig?: Record<string, any>;
    // Dim effect options
    dimStartOpacity?: number;
    dimEndOpacity?: number;
    dimDuration?: number;
    dimEasing?: DimEasing;
    // Wrap (prefix/suffix) options
    wrapPrefix?: string;
    wrapSuffix?: string;
    wrapScope?: 'match' | 'line';
}

export type TriggerType = 'pattern' | 'event';

export interface UserTrigger {
    type?: TriggerType;  // defaults to 'pattern' for backwards compatibility
    pattern?: string;    // for pattern triggers
    event?: string;      // for event triggers (e.g., 'kill', 'combatState')
    flags?: string;      // for pattern triggers only
    gmcpMsgType?: string; // limit pattern trigger to specific GMCP message type
    macros: UserMacro[];
}

export interface SupportedEvent {
    id: string;
    label: string;
    category: string;
}

export const SUPPORTED_EVENTS: SupportedEvent[] = [
    // Combat
    { id: 'kill', label: 'Zabicie (ja/druzyna)', category: 'Walka' },
    { id: 'enemyKilled', label: 'Wrog zabity', category: 'Walka' },
    { id: 'allEnemiesKilled', label: 'Wszyscy wrogowie zabici', category: 'Walka' },
    { id: 'combatState:true', label: 'Walka - start', category: 'Walka' },
    { id: 'combatState:false', label: 'Walka - koniec', category: 'Walka' },
    { id: 'enemy.paralyzed', label: 'Wrog ogluszony', category: 'Walka' },
    { id: 'enemy.paralyzed.end', label: 'Wrog - koniec ogluszenia', category: 'Walka' },
    { id: 'enemy.broken_defense', label: 'Wrog - zlamana obrona', category: 'Walka' },

    // Connection
    { id: 'client.connect', label: 'Polaczenie', category: 'Polaczenie' },
    { id: 'client.disconnect', label: 'Rozlaczenie', category: 'Polaczenie' },

    // Timers
    { id: 'zaskTimer', label: 'Timer zaskoczenia', category: 'Timery' },
    { id: 'coverTimer', label: 'Timer oslony', category: 'Timery' },
    { id: 'transportTimer', label: 'Timer transportu', category: 'Timery' },
];

const STORAGE_KEY = 'triggers';

function applyMacrosToMatch(
    client: Client,
    line: AnsiAwareBuffer,
    match: RegExpMatchArray,
    macros: UserMacro[]
): void {
    const matchStart = match.index ?? 0;
    let matchRange: TextRange = [matchStart, matchStart + match[0].length];

    macros?.forEach(macro => {
        switch (macro.type) {
            case 'uppercase':
                line.replace(matchRange, line.text.substring(matchRange[0], matchRange[1]).toUpperCase());
                break;
            case 'color':
                if (macro.color) {
                    const color = createColorFormat(macro.color);
                    line.applyFormat(matchRange, color);
                }
                break;
            case 'replace':
                const replacement = macro.to || '';
                line.replace(matchRange, replacement);
                matchRange = [matchRange[0], matchRange[0] + replacement.length];
                break;
            case 'beep':
                client.sendEvent("sound:play", {key: macro.soundKey || "beep"});
                break;
            case 'mute':
                client.SoundManager.mute();
                break;
            case 'unmute':
                client.SoundManager.unmute();
                break;
            case 'command':
                if (macro.command) {
                    client.sendCommand(macro.command);
                }
                break;
            case 'slowBlink':
                line.applyFormat(matchRange, { slowBlink: true });
                break;
            case 'rapidBlink':
                line.applyFormat(matchRange, { rapidBlink: true });
                break;
            case 'dim':
                line.applyFormat(matchRange, {
                    dim: {
                        startOpacity: macro.dimStartOpacity ?? 1,
                        endOpacity: macro.dimEndOpacity ?? 0.3,
                        duration: macro.dimDuration ?? 1000,
                        easing: macro.dimEasing,
                    }
                });
                break;
            case 'wrap': {
                const prefix = macro.wrapPrefix || '';
                const suffix = macro.wrapSuffix || '';
                if (macro.wrapScope === 'line') {
                    if (suffix) line.insert(line.length, suffix);
                    if (prefix) line.insert(0, prefix);
                    matchRange = [matchRange[0] + prefix.length, matchRange[1] + prefix.length];
                } else {
                    if (suffix) line.insert(matchRange[1], suffix);
                    if (prefix) line.insert(matchRange[0], prefix);
                    matchRange = [matchRange[0], matchRange[1] + prefix.length + suffix.length];
                }
                break;
            }
            case 'functionalBind':
                if (macro.command && macro.label) {
                    client.FunctionalBind.set(macro.label, () => {
                        client.sendCommand(macro.command!);
                    });
                }
                break;
            case 'notify': {
                const text = macro.message || line.text.substring(matchRange[0], matchRange[1]);
                client.sendEvent("notify", { text, system: true });
                break;
            }
            default:
                // Handle plugin trigger macros
                if (macro.type.startsWith('plugin:')) {
                    executeTriggerMacro(macro.type, {
                        client,
                        line,
                        match,
                        matchRange,
                    }, macro.pluginConfig || {});
                }
                break;
        }
    });
}

function applyEventMacros(
    client: Client,
    macros: UserMacro[]
): void {
    macros?.forEach(macro => {
        switch (macro.type) {
            case 'beep':
                client.sendEvent("sound:play", {key: macro.soundKey || "beep"});
                break;
            case 'mute':
                client.SoundManager.mute();
                break;
            case 'unmute':
                client.SoundManager.unmute();
                break;
            case 'command':
                if (macro.command) {
                    client.sendCommand(macro.command);
                }
                break;
            case 'functionalBind':
                if (macro.command && macro.label) {
                    client.FunctionalBind.set(macro.label, () => {
                        client.sendCommand(macro.command!);
                    });
                }
                break;
            case 'notify':
                if (macro.message) {
                    client.sendEvent("notify", { text: macro.message, system: true });
                }
                break;
            // Note: Plugin macros are not supported for event triggers
            // because they require text context (line, match, matchRange)
        }
    });
}

type EventHandler = { event: string; handler: (data: unknown) => void };

export default function initUserTriggers(client: Client) {
    let registeredPatternTriggers: Trigger[] = [];
    let registeredEventHandlers: EventHandler[] = [];

    const apply = (list: UserTrigger[] = []) => {
        // Clean up pattern triggers
        registeredPatternTriggers.forEach(t => client.Triggers.removeTrigger(t));
        registeredPatternTriggers = [];

        // Clean up event handlers
        registeredEventHandlers.forEach(({ event, handler }) => {
            client.off(event as any, handler);
        });
        registeredEventHandlers = [];

        // Process each trigger
        list.forEach(item => {
            const triggerType = item.type || 'pattern';

            if (triggerType === 'event' && item.event) {
                // Event-based trigger
                const [eventName, eventValue] = item.event.split(':');

                const handler = (data: unknown) => {
                    // For events like 'combatState:true', check the value
                    if (eventValue !== undefined) {
                        if (String(data) !== eventValue) return;
                    }
                    applyEventMacros(client, item.macros);
                };

                client.on(eventName as any, handler);
                registeredEventHandlers.push({ event: eventName, handler });
            } else if (item.pattern) {
                // Pattern-based trigger
                const flags = item.flags || '';
                const hasGlobalFlag = flags.includes('g');
                const hasCaseInsensitiveFlag = flags.includes('i');
                const hasMultilineFlag = flags.includes('m');

                // Build regexp flags without 'i' (handled by TriggerOptions) and without 'm' (handled by trigger type)
                const regexpFlags = hasGlobalFlag ? 'g' : '';

                let regexp: RegExp;
                try {
                    regexp = new RegExp(item.pattern, regexpFlags);
                } catch (e) {
                    console.error('Invalid trigger pattern', item.pattern, item.flags, e);
                    return;
                }

                const callback = (line: AnsiAwareBuffer, matches: RegExpMatchArray, type: string) => {
                    if (item.gmcpMsgType && type !== item.gmcpMsgType) return line;
                    if (hasGlobalFlag) {
                        // For global flag, find all matches and apply macros to each
                        const globalRegexp = new RegExp(item.pattern!, 'g' + (hasCaseInsensitiveFlag ? 'i' : ''));
                        let match: RegExpExecArray | null;
                        const allMatches: RegExpExecArray[] = [];

                        while ((match = globalRegexp.exec(line.text)) !== null) {
                            allMatches.push(match);
                            if (match[0].length === 0) {
                                globalRegexp.lastIndex++;
                            }
                        }

                        // Apply in reverse order to preserve indices
                        for (let i = allMatches.length - 1; i >= 0; i--) {
                            applyMacrosToMatch(client, line, allMatches[i], item.macros);
                        }
                    } else {
                        applyMacrosToMatch(client, line, matches, item.macros);
                    }
                    return line;
                };

                const trigger = hasMultilineFlag
                    ? client.Triggers.registerMultilineTrigger(regexp, callback, STORAGE_KEY, { caseInsensitive: hasCaseInsensitiveFlag })
                    : client.Triggers.registerTrigger(regexp, callback, STORAGE_KEY, { caseInsensitive: hasCaseInsensitiveFlag });

                registeredPatternTriggers.push(trigger);
            }
        });
    };

    const initialTriggers = globalStorage.get(STORAGE_KEY);
    if (initialTriggers) apply(Array.isArray(initialTriggers) ? initialTriggers : []);

    globalStorage.onChange(STORAGE_KEY, (newValue) => {
        apply(Array.isArray(newValue) ? newValue : []);
    });
}
