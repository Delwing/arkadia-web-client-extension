import Triggers from "./Triggers";
import MapHelper from "@shared/map/MapHelper";
import {Colors, mudletColorLine, setXtermPalette} from "@modules/core/Colors";
import MovementManager from "./MovementManager";
import {formatLabel, FunctionalBindManager, LINE_START_EVENT,} from "./scripts/functionalBind";
import TeamManager from "./TeamManager";
import ObjectManager from "./ObjectManager";
import {attachGmcpListener} from "./gmcp";
import {characterStorage, globalStorage} from "@modules/core/storage";
import {defaultSettings} from "@modules/core/defaultSettings";
import {stripPolishCharacters} from "./stripPolishCharacters";
import eventBus from "@modules/core/eventBus";
import type {ClientEvents} from "@shared/events";

import type {HerbManagerApi} from "./types/herbs";
import type {CommandOptions} from "./scripts/commandPreserveCaseMode";

/**
 * Command hook callback type.
 * Hooks are called early in sendCommand before any processing.
 * @param command - The original command string
 * @param echo - Whether command should be echoed
 * @param options - Command options
 * @returns Modified command string, null to suppress, or undefined to keep original
 */
export type CommandHookCallback = (
    command: string,
    echo: boolean,
    options?: CommandOptions
) => string | null | undefined;

/**
 * Registered command hook with metadata
 */
export interface CommandHook {
    id: string;
    callback: CommandHookCallback;
    priority: number;
}
import {DEFAULT_ATTACK_COMMAND, normalizeAttackCommand} from "./utils/attackCommand";
import {DEFAULT_DRAW_WEAPON_COMMAND, normalizeDrawWeaponCommand} from "./utils/drawWeaponCommand";
import {createAttackController} from "./utils/attackController";
import initAllyProtection from "./scripts/allyProtection";
import SoundManager from "./SoundManager";
import NotificationManager from "./NotificationManager";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";
import {bindMatches} from "@modules/core/keymapTypes";

type EventKey = keyof ClientEvents;
type EventParams<K extends EventKey> = [ClientEvents[K]] extends [void]
    ? []
    : [ClientEvents[K]] extends [any[]]
        ? ClientEvents[K]
        : [ClientEvents[K]];
type ClientEventListener<K extends EventKey> = (...args: EventParams<K>) => void;
type ListenerOptions = boolean | { once?: boolean; signal?: AbortSignal };

export interface ClientAdapter {
    send(text: string, echo?: boolean, options?: CommandOptions): void;

    output(text?: string | AnsiAwareBuffer, type?: string): void

    sendGmcp(type: string, payload?: any): void

    flushMessageBuffer(): void

    emit(event: string, ...args: any[]): void;

    shouldEchoCommand(): boolean;
}

export default class Client {
    clientAdapter: ClientAdapter;
    Colors = Colors;
    FunctionalBind = new FunctionalBindManager(this);
    public Triggers = new Triggers(this);
    public Map = new MapHelper({
        on: this.on.bind(this),
        sendCommand: this.sendCommand.bind(this),
        sendEvent: this.sendEvent.bind(this),
        getSuppressMapMoveEvent: () => this.suppressMapMoveEvent,
        setSuppressMapMoveEvent: (value: boolean) => {
            this.suppressMapMoveEvent = value;
        },
        functionalBind: this.FunctionalBind,
        shouldSetDrinkableBind: () => globalStorage.get('uiSettings')?.drinkableAsFunctionalBind !== false,
    });
    public TeamManager = new TeamManager(this);
    public ObjectManager = new ObjectManager(this);
    public AttackController = createAttackController(this);
    public AllyProtection = initAllyProtection(this);
    contentWidth = 0;
    commandLineSuggestions: string[] = [];
    readonly SoundManager = new SoundManager(this);
    public readonly notificationManager = new NotificationManager();
    public readonly movementManager = new MovementManager(this);
    aliases: { pattern: RegExp; callback: Function }[] = [];
    lampBind = {key: "Digit4", ctrl: true} as {
        key: string;
        ctrl?: boolean;
        alt?: boolean;
        shift?: boolean;
    };
    attackBind = {key: "Digit1", ctrl: true} as {
        key: string;
        ctrl?: boolean;
        alt?: boolean;
        shift?: boolean;
    };
    attackCommand = DEFAULT_ATTACK_COMMAND;
    drawWeaponCommand = DEFAULT_DRAW_WEAPON_COMMAND;
    supportBind = {key: "KeyQ", ctrl: true} as {
        key: string;
        ctrl?: boolean;
        alt?: boolean;
        shift?: boolean;
    };
    moveModeBind = {key: "Backquote"} as {
        key: string;
        ctrl?: boolean;
        alt?: boolean;
        shift?: boolean;
    };
    customBinds: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; command: string }[] = [];
    tempBinds: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; command: string | null }[] = [
        { key: 'F4', command: null },
        { key: 'F5', command: null },
    ];
    inLineProcess = false; //TODO figure out something else
    defaultColor = 255;
    buffer: { out: AnsiAwareBuffer, type?: string }[] = [];
    suppressMapMoveEvent = false;
    suppressItemEvaluation = false;
    moveModeButton?: HTMLInputElement | HTMLButtonElement;

    get moveMode() { return this.movementManager.moveMode; }
    set moveMode(v: number) { this.movementManager.moveMode = v; }

    get carriageMode() { return this.movementManager.carriageMode; }
    set carriageMode(v: boolean) { this.movementManager.carriageMode = v; }

    get preWalkCommands() { return this.movementManager.preWalkCommands; }
    set preWalkCommands(v: string[]) { this.movementManager.preWalkCommands = v; }

    get postWalkCommands() { return this.movementManager.postWalkCommands; }
    set postWalkCommands(v: string[]) { this.movementManager.postWalkCommands = v; }
    herbManager?: HerbManagerApi;
    private commandHooks: CommandHook[] = [];


    constructor(clientAdapter: ClientAdapter) {
        this.clientAdapter = clientAdapter
        attachGmcpListener(this);

        this.updateContentWidth();
        const outputWrapper = document.getElementById('main_text_output_msg_wrapper');
        if (outputWrapper) {
            new ResizeObserver(() => this.updateContentWidth()).observe(outputWrapper);
        }
        window.addEventListener('resize', () => this.updateContentWidth());
        globalStorage.onChange('uiSettings', () => this.updateContentWidth());

        window.addEventListener('keydown', (ev) => {
            if (bindMatches(ev, this.lampBind)) {
                this.sendCommand('napelnij lampe olejem')
                ev.preventDefault()
            }
            if (bindMatches(ev, this.attackBind)) {
                const id = this.TeamManager.getAttackTargetId?.()
                if (id) {
                    if (this.AllyProtection.isAlly(id)) {
                        if (this.AllyProtection.checkPendingAttack(id, 'attackBind')) {
                            const command = `${this.attackCommand} ob_${id}`;
                            this.sendCommand(command)
                        } else {
                            const info = this.AllyProtection.getAllyInfo(id);
                            this.AllyProtection.showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
                            this.AllyProtection.setPendingAttack(id, 'attackBind');
                        }
                    } else {
                        const command = `${this.attackCommand} ob_${id}`;
                        this.sendCommand(command)
                    }
                }
                ev.preventDefault()
            }
            if (bindMatches(ev, this.supportBind)) {
                const targetId = this.TeamManager.getAttackTargetId?.()
                if (targetId && this.AllyProtection.isAlly(targetId)) {
                    if (this.AllyProtection.checkPendingAttack(targetId, 'supportBind')) {
                        this.support()
                    } else {
                        const info = this.AllyProtection.getAllyInfo(targetId);
                        this.AllyProtection.showAllyWarning(info?.name ?? '?', info?.guild ?? '?');
                        this.AllyProtection.setPendingAttack(targetId, 'supportBind');
                    }
                } else {
                    this.support()
                }
                ev.preventDefault()
            }
            this.customBinds.forEach(cb => {
                if (bindMatches(ev, cb)) {
                    this.sendCommand(cb.command)
                    ev.preventDefault()
                }
            })
            this.tempBinds.forEach(tb => {
                if (!tb.command) {
                    return
                }
                if (bindMatches(ev, tb)) {
                    this.sendCommand(tb.command)
                    ev.preventDefault()
                }
            })
        })

        const applyBinds = (b: any) => {
            if (!b) {
                return
            }
            const bind = b?.main
            if (bind) {
                this.FunctionalBind.updateOptions({
                    key: bind.key,
                    ctrl: bind.ctrl,
                    alt: bind.alt,
                    shift: bind.shift,
                    label: formatLabel(bind)
                })
            }
            // Per-category bind overrides (gates, transport) – fall back to main
            const gatesBind = b?.mainGates || bind;
            if (gatesBind) {
                this.FunctionalBind.updateOptions({
                    key: gatesBind.key,
                    ctrl: gatesBind.ctrl,
                    alt: gatesBind.alt,
                    shift: gatesBind.shift,
                    label: formatLabel(gatesBind)
                }, 'gates')
            }
            const transportBind = b?.mainTransport || bind;
            if (transportBind) {
                this.FunctionalBind.updateOptions({
                    key: transportBind.key,
                    ctrl: transportBind.ctrl,
                    alt: transportBind.alt,
                    shift: transportBind.shift,
                    label: formatLabel(transportBind)
                }, 'transport')
            }
            const lootBind = b?.mainLoot || bind;
            if (lootBind) {
                this.FunctionalBind.updateOptions({
                    key: lootBind.key,
                    ctrl: lootBind.ctrl,
                    alt: lootBind.alt,
                    shift: lootBind.shift,
                    label: formatLabel(lootBind)
                }, 'loot')
            }
            const lamp = b?.lamp
            if (lamp) {
                this.lampBind = { ...lamp }
            }
            const attack = b?.attack
            if (attack) {
                this.attackBind = { ...attack }
            }
            const support = b?.support
            if (support) {
                this.supportBind = { ...support }
            }
            const moveMode = b?.moveMode
            if (moveMode) {
                this.moveModeBind = { ...moveMode }
            }
            const temp = b?.temp
            if (Array.isArray(temp)) {
                temp.forEach((tempBind: any, index: number) => {
                    if (!tempBind || typeof tempBind !== 'object') {
                        return
                    }
                    if (typeof tempBind.key !== 'string' || tempBind.key === '') {
                        return
                    }
                    const current = this.tempBinds[index]
                    if (current) {
                        current.key = tempBind.key
                        current.ctrl = tempBind.ctrl ? true : undefined
                        current.alt = tempBind.alt ? true : undefined
                        current.shift = tempBind.shift ? true : undefined
                    } else {
                        this.tempBinds[index] = {
                            key: tempBind.key,
                            ctrl: tempBind.ctrl ? true : undefined,
                            alt: tempBind.alt ? true : undefined,
                            shift: tempBind.shift ? true : undefined,
                            command: null,
                        }
                    }
                })
            }
            const custom = b?.custom
            if (custom) {
                this.customBinds = [...custom]
            } else {
                this.customBinds = []
            }
        }

        const initialSettings = characterStorage.get('settings');
        this.attackCommand = normalizeAttackCommand(initialSettings?.attackCommand);
        this.drawWeaponCommand = normalizeDrawWeaponCommand(initialSettings?.drawWeaponCommand);

        characterStorage.onChange('settings', (settings) => {
            const detail = (settings ?? defaultSettings) as Record<string, any>;
            this.attackCommand = normalizeAttackCommand(detail?.attackCommand);
            this.drawWeaponCommand = normalizeDrawWeaponCommand(detail?.drawWeaponCommand);
        });

        globalStorage.onChange('binds', (binds) => {
            applyBinds(binds as any);
        });

        globalStorage.onChange('uiSettings', (uiSettings) => {
            if (uiSettings?.xtermPalette === 'arkadia' || uiSettings?.xtermPalette === 'proper') {
                setXtermPalette(uiSettings.xtermPalette);
            }
        });

        this.on('gmcp.char.info', (info) => {
            if (info?.name) {
                characterStorage.setCharacter(info.name);
            }
            if (typeof info?.object_num !== 'undefined') {
                const newNum = String(info.object_num);
                const stored = characterStorage.get('object_num');
                if (typeof stored !== 'undefined' && String(stored) !== newNum) {
                    this.sendEvent('reset');
                }
                characterStorage.set('object_num', newNum);
            }
            if (info?.gender) {
                characterStorage.set('gender', info.gender);
            }
        });

        this.on('gmcp.char.colors', (data) => {
            this.defaultColor = data?.text ?? 255;
        });

        this.on('printLine', (text) => {
            this.println(text);
        });

        this.on('output-sent', () => {
            if (this.buffer.length == 0) return
            this.buffer.forEach(item => this.clientAdapter.output(item.out, item.type))
            this.sendEvent('buffer-sent', this.buffer.length)
            this.buffer = []
        });

        this.on('flushLines', (groups: { text: string; type: string }[]) => {
            const deferred: Array<() => void> = [];

            for (const {text, type} of groups) {
                const parts = this.onLine(text, type);
                for (const part of parts) {
                    deferred.push(() => this.sendEvent(`gmcp_msg.${type}` as any, part));
                    this.clientAdapter.output(part, type);
                }
            }

            this.sendEvent('output-sent', groups.length);
            deferred.forEach(fn => fn());
        });

        // Apply initial binds and uiSettings from storage
        const initialBinds = globalStorage.get('binds');
        if (initialBinds) applyBinds(initialBinds as any);
        const initialUiSettings = globalStorage.get('uiSettings');
        if (initialUiSettings?.xtermPalette === 'arkadia' || initialUiSettings?.xtermPalette === 'proper') {
            setXtermPalette(initialUiSettings.xtermPalette);
        }
    }

    on<K extends EventKey>(event: K, listener: ClientEventListener<K>, options?: ListenerOptions): () => void {
        return eventBus.on(event, listener, options);
    }

    off<K extends EventKey>(event: K, listener: ClientEventListener<K>): void {
        eventBus.off(event, listener);
    }

    emit<K extends EventKey>(event: K, ...args: EventParams<K>): void {
        eventBus.emit(event, ...args);
    }

    setTempBind(index: number, command: string) {
        const bind = this.tempBinds[index]
        if (!bind) {
            return
        }
        const trimmed = command.trim()
        bind.command = trimmed ? trimmed : null
        const label = formatLabel(bind)
        if (bind.command) {
            this.println(`Tymczasowe przypisanie ${index + 1} (${label}) ustawione na: ${bind.command}`)
        } else {
            this.println(`Tymczasowe przypisanie ${index + 1} (${label}) zostalo wyczyszczone.`)
        }
    }

    send(command: string, echo: boolean = true, options?: CommandOptions) {
        if (echo && this.clientAdapter.shouldEchoCommand()) {
            this.echoCommand(command);
        }
        this.clientAdapter.send(command, false, options)
    }

    echoCommand(command: string): void {
        const display = this.ObjectManager.resolveObjectIds(command);
        this.clientAdapter.output("→ " + display, 'command');
    }

    support() {
        this.AttackController.support();
    }

    attackEnemySlot(_slotIndex: number) {
        // Implementation provided by enemyBinds.ts
    }

    blockEnemySlot(_slotIndex: number) {
        // Implementation provided by enemyBinds.ts
    }

    releaseGuard() {
        this.sendCommand('przestan zaslaniac')
    }

    goOutOfGuard() {
        this.sendCommand('przestan kryc sie za zaslona')
    }

    drawWeapon() {
        this.sendCommand(`${this.drawWeaponCommand} wszystkich broni`)
    }

    async sendCommand(command: string, echo: boolean = true, options?: CommandOptions, skipMapParse: boolean = false, fromUserInput: boolean = false): Promise<void> {
        // Run command hooks early - before any processing
        for (const hook of this.commandHooks) {
            const result = hook.callback(command, echo, options);
            if (result === null) {
                // Hook suppressed the command
                return;
            }
            if (result !== undefined) {
                // Hook modified the command
                command = result;
            }
        }

        if (command) {
            command = stripPolishCharacters(command)
        }
        this.sendEvent('command', command)

        let commandChanged = false
        if (!skipMapParse) {
            const parsedCommand = this.Map.parseCommand(command)
            if (parsedCommand === null) {
                return
            }
            commandChanged = parsedCommand !== command
            command = parsedCommand
        }
        command = this.expandObjectShortcuts(command)
        if (command.startsWith('echo ')) {
            this.print(mudletColorLine(command.substring(5)))
            return
        }
        const split = command.split((fromUserInput && !commandChanged) ? /;/ : /[#;]/)
        if (split.length > 1) {
            for (const part of split) {
                await this.sendCommand(part, echo, options, skipMapParse || commandChanged)
            }
            return
        }

        for (const alias of this.aliases) {
            const matches = command.match(alias.pattern)
            if (matches) {
                const result = alias.callback(matches)
                if (result && typeof (result as Promise<unknown>).then === 'function') {
                    await result
                }
                return
            }
        }

        if (command.startsWith('/') && command.match(/^\/\w+/)) {
            this.print(mudletColorLine(`--- <tomato>Nieznany alias<reset>: ${command}`))
            return
        }
        this.movementManager.sendMovement(command, echo, options)
    }

    sendGMCP(type: string, payload?: any) {
        this.clientAdapter.sendGmcp(type, payload)
    }

    /**
     * Register a command hook that can alter or suppress commands before processing.
     * Hooks are called in priority order (higher priority first).
     * @param id - Unique identifier for the hook
     * @param callback - Hook callback function
     * @param priority - Hook priority (default 0, higher runs first)
     */
    registerCommandHook(id: string, callback: CommandHookCallback, priority: number = 0): void {
        // Remove existing hook with same id
        this.unregisterCommandHook(id);
        this.commandHooks.push({ id, callback, priority });
        // Sort by priority (descending)
        this.commandHooks.sort((a, b) => b.priority - a.priority);
    }

    /**
     * Unregister a command hook by id
     * @param id - Hook identifier to remove
     * @returns true if hook was found and removed
     */
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
            const obj = this.ObjectManager.getObjectsOnLocation().find(o => o.shortcut?.toLowerCase() === short.toLowerCase())
            return obj ? `ob_${obj.num}` : match
        })
    }

    onLine(line: string, type: string): AnsiAwareBuffer[] {
        const buffer = new AnsiAwareBuffer(line)
        if (buffer.text.length === 0) {
            return []
        }
        this.inLineProcess = true
        this.sendEvent(LINE_START_EVENT)
        const multilineResult = this.Triggers.parseMultiline(buffer, type)
        if (multilineResult === null) {
            this.inLineProcess = false
            return []
        }

        const split = multilineResult.splitLines()
        const result = split.map(part => this.Triggers.parseLine(part, type)).filter(part => part !== null)
        this.inLineProcess = false

        // Merge multiple lines back into a single buffer to keep multiline outputs grouped
        if (result.length > 1) {
            const merged = new AnsiAwareBuffer();
            for (let i = 0; i < result.length; i++) {
                merged.appendBuffer(result[i]);
                if (i < result.length - 1) {
                    merged.append('\n');
                }
            }
            return [merged];
        }

        return result
    }

    sendEvent<K extends EventKey>(type: K, ...args: EventParams<K>): void;
    sendEvent(type: string, ...args: unknown[]): void;
    sendEvent(type: string, ...args: unknown[]): void {
        const eventName = type as EventKey;
        (eventBus.emit as (...emitArgs: any[]) => number)(eventName, ...args);
    }


    createEvent(type, payload) {
        return {
            type: type,
            data: payload,
        }
    }

    print(printable: AnsiAwareBuffer | string) {
        const out = typeof printable === 'string' ? new AnsiAwareBuffer(printable) : printable
        this.buffer.push({out: out})
        if (!this.inLineProcess) {
            this.sendEvent('output-sent', 1)
        }
    }

    println(printable: AnsiAwareBuffer | string) {
        this.print('\n')
        this.print(printable)
        this.print('\n')
    }

    prepareSounds(): Promise<void> {
        return this.SoundManager.prepare()
    }

    enableNotifications() {
        this.notificationManager.enableNotifications();
    }

    notify(message: string) {
        this.notificationManager.notify(message);
    }

    prefix(rawLine: string, prefix: string) {
        return prefix + rawLine
    }

    postfix(rawLine: string, postfix: string) {
        return rawLine + postfix
    }

    updateContentWidth() {
        const content = document.getElementById('main_text_output_msg_wrapper') as HTMLElement | null
        const measure = document.getElementById('content-width-measure') as HTMLElement | null
        if (!content || !measure) {
            return
        }
        const style = window.getComputedStyle(content)
        measure.style.fontFamily = style.fontFamily
        measure.style.fontSize = style.fontSize
        const charWidth = measure.getBoundingClientRect().width
        const paddingLeft = parseFloat(style.paddingLeft) || 0
        const paddingRight = parseFloat(style.paddingRight) || 0
        const width = content.clientWidth - paddingLeft - paddingRight
        if (charWidth > 0 && width > 0) {
            this.contentWidth = Math.floor(width / charWidth)
            this.sendEvent('contentWidth', this.contentWidth)
        }
    }
}
