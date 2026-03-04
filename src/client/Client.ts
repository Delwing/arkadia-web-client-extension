import Triggers from "./Triggers";
import MapHelper from "@shared/map/MapHelper";
import {isDirection} from "@shared/map/directions";
import {Colors, mudletColorLine, setXtermPalette} from "@modules/core/Colors";
import {formatLabel, FunctionalBind, LINE_START_EVENT,} from "./scripts/functionalBind";
import TeamManager from "./TeamManager";
import ObjectManager from "./ObjectManager";
import {attachGmcpListener} from "./gmcp";
import {getItemSync, setCurrentCharacter, setItemSync} from "@modules/core/storage";
import {stripPolishCharacters} from "./stripPolishCharacters";
import eventBus from "@modules/core/eventBus";
import type {ClientEvents} from "@shared/events";
import {openMapContextMenu} from "@modules/core/contextMenus";
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

    isCommandEchoEnabled(): boolean;
}

export default class Client {
    clientAdapter: ClientAdapter;
    port?: any;
    Colors = Colors;
    FunctionalBind = new FunctionalBind(this);
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
    });
    public TeamManager = new TeamManager(this);
    public ObjectManager = new ObjectManager(this);
    public AttackController = createAttackController(this);
    public AllyProtection = initAllyProtection(this);
    contentWidth = 0;
    commandLineSuggestions: string[] = [];
    readonly SoundManager = new SoundManager(this);
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
    moveMode = 0;
    carriageMode = false;
    moveModeButton?: HTMLInputElement | HTMLButtonElement;
    preWalkCommands: string[] = [];
    postWalkCommands: string[] = [];
    herbManager?: HerbManagerApi;
    private commandHooks: CommandHook[] = [];


    constructor(clientAdapter: ClientAdapter, port: any) {
        this.clientAdapter = clientAdapter
        attachGmcpListener(this);

        this.updateContentWidth();
        const outputWrapper = document.getElementById('main_text_output_msg_wrapper');
        if (outputWrapper) {
            new ResizeObserver(() => this.updateContentWidth()).observe(outputWrapper);
        }
        window.addEventListener('resize', () => this.updateContentWidth());
        this.on('uiSettings', () => this.updateContentWidth());

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

        const initialSettings = getItemSync('settings')?.settings;
        this.attackCommand = normalizeAttackCommand(initialSettings?.attackCommand);
        this.drawWeaponCommand = normalizeDrawWeaponCommand(initialSettings?.drawWeaponCommand);

        this.on('settings', (settings) => {
            const detail = (settings ?? {}) as Record<string, any>;
            // Note: binds are stored separately under 'binds' key, not inside 'settings'
            // The 'binds' event handler applies binds changes
            this.attackCommand = normalizeAttackCommand(detail?.attackCommand);
            this.drawWeaponCommand = normalizeDrawWeaponCommand(detail?.drawWeaponCommand);
        });

        this.on('binds', (binds) => {
            applyBinds(binds as any);
        });

        this.on('uiSettings', (uiSettings) => {
            if (uiSettings?.xtermPalette === 'arkadia' || uiSettings?.xtermPalette === 'proper') {
                setXtermPalette(uiSettings.xtermPalette);
            }
        });

        this.on('gmcp.char.info', (info) => {
            const detail = info as any;
            if (detail?.name) {
                setCurrentCharacter(detail.name);
                if (this.port) {
                    ['settings', 'kill_counter', 'deposits', 'containers', 'herb_counts', 'mapperRoomId', 'binds', 'lastLang'].forEach(k => {
                        this.port!.postMessage({ type: 'GET_STORAGE', key: k });
                    });
                }
            }
            if (typeof detail?.object_num !== 'undefined') {
                const newNum = String(detail.object_num);
                const stored = getItemSync('object_num')?.object_num;
                if (typeof stored !== 'undefined' && String(stored) !== newNum) {
                    this.sendEvent('reset');
                }
                setItemSync('object_num', newNum);
            }
        });

        this.on('gmcp.char.colors', (data) => {
            const detail = data as any;
            this.defaultColor = detail?.text ?? 255;
        });

        this.on('output-sent', () => {
            if (this.buffer.length == 0) return
            this.buffer.forEach(item => this.clientAdapter.output(item.out, item.type))
            this.sendEvent('buffer-sent', this.buffer.length)
            this.buffer = []
        });

        this.port = port
        port.onMessage.addListener((message) => {
            if (message && typeof message.type === 'string') {
                this.sendEvent(message.type, message.data)
                return
            }
            if (message && typeof message === 'object') {
                Object.entries(message).forEach(([key, value]) => {
                    this.sendEvent(key, value)
                })
            }
        })
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

    connect(port: any, initial: boolean) {
        if (initial) {
            port.postMessage({type: 'GET_STORAGE', key: 'scripts'})
        }
        this.port = port
        this.sendEvent('port-connected')
        console.log("Client connected to background service.")
    }

    send(command: string, echo: boolean = true, options?: CommandOptions) {
        this.clientAdapter.send(command, echo, options)
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
        this.sendMovement(command, echo, options)
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

    private sendMovement(command: string, echo: boolean, options?: CommandOptions) {
        // Check if command is already prefixed with przemknij/jedz - extract direction and move map
        let direction: string
        let movePrefix = ''

        if (command.startsWith('przemknij z druzyna ')) {
            direction = command.substring(20)
            movePrefix = 'przemknij z druzyna '
        } else if (command.startsWith('przemknij ')) {
            direction = command.substring(10)
            movePrefix = 'przemknij '
        } else {
            direction = command
        }

        // Check if original direction is a direction command (for pre/post walk)
        const isOriginalDirection = isDirection(direction)

        const moveRes = this.Map.move(direction)
        if (moveRes.suppress) {
            return
        }
        if (moveRes.moved) {
            this.Map.setBlockable(true)
        }

        // Execute pre-walk commands if original command was a direction or map moved
        if (isOriginalDirection || moveRes.moved) {
            for (const cmd of this.preWalkCommands) {
                this.sendCommand(cmd, echo, options)
            }
        }

        // Determine command to send:
        // - If already prefixed, apply same prefix to resolved direction
        // - If map moved, apply move mode to resolved direction
        // - Otherwise send resolved direction as-is
        let commandToSend: string
        if (movePrefix) {
            commandToSend = movePrefix + moveRes.direction
        } else if (moveRes.moved) {
            commandToSend = this.applyMoveModePrefix(moveRes.direction)
        } else {
            commandToSend = this.applyMoveMode(moveRes.direction)
        }
        this.clientAdapter.send(commandToSend, echo, options)

        // Execute post-walk commands if original command was a direction or map moved
        if (isOriginalDirection || moveRes.moved) {
            for (const cmd of this.postWalkCommands) {
                this.sendCommand(cmd, echo, options)
            }
        }
    }

    private applyMoveMode(cmd: string): string {
        if (!isDirection(cmd)) return cmd
        return this.applyMoveModePrefix(cmd)
    }

    private applyMoveModePrefix(cmd: string): string {
        if (this.carriageMode) return `jedz na ${cmd}`
        if (this.moveMode === 1) return `przemknij ${cmd}`
        if (this.moveMode === 2) return `przemknij z druzyna ${cmd}`
        return cmd
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

    openMapContextMenu(roomId: number, x: number, y: number, extraItems?: import("@modules/core/contextMenus").ContextMenuItem[]) {
        openMapContextMenu(this, roomId, x, y, extraItems);
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
        if (typeof Notification === 'undefined') {
            return
        }
        if ('serviceWorker' in navigator && navigator.serviceWorker) {
            navigator.serviceWorker.register('sw.js').catch(() => {})
        }
        if (Notification.permission === 'default') {
            Notification.requestPermission()
        }
    }

    notify(message: string) {
        if (typeof Notification === 'undefined') {
            return
        }
        if (Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker) {
                navigator.serviceWorker.ready
                    .then((reg) => reg.showNotification(message))
                    .catch(() => {})
            } else {
                new Notification(message)
            }
        }
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
