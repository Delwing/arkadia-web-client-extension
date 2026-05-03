import Triggers from "./Triggers";
import MapHelper from "@shared/map/MapHelper";
import {Colors, setXtermPalette} from "@modules/core/Colors";
import MovementManager from "./MovementManager";
import CommandProcessor from "./CommandProcessor";
import type { CommandHookCallback } from "./CommandProcessor";
import type { AliasList } from "./AliasList";
import {FunctionalBindManager, LINE_START_EVENT,} from "./scripts/functionalBind";
import TeamManager from "./TeamManager";
import ObjectManager from "./ObjectManager";
import {attachGmcpListener, gmcp} from "./gmcp";
import {characterStorage, globalStorage} from "@modules/core/storage";
import {defaultSettings} from "@modules/core/defaultSettings";
import eventBus from "@modules/core/eventBus";
import type {ClientEvents} from "@shared/events";

import type {HerbManagerApi} from "./types/herbs";
import type {CommandOptions} from "./scripts/commandPreserveCaseMode";

export type { CommandHookCallback, CommandHook } from "./CommandProcessor";
import {DEFAULT_ATTACK_COMMAND, normalizeAttackCommand} from "./utils/attackCommand";
import {DEFAULT_DRAW_WEAPON_COMMAND, normalizeDrawWeaponCommand} from "./utils/drawWeaponCommand";
import {createAttackController} from "./utils/attackController";
import initAllyProtection from "./scripts/allyProtection";
import SoundManager from "./SoundManager";
import NotificationManager from "./NotificationManager";
import KeyBindingManager from "./KeyBindingManager";
import {AnsiAwareBuffer} from "@client/ansi/FormatState.ts";

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
        setPreWalkCommands: (cmds: string[]) => { this.movementManager.preWalkCommands = cmds; },
        setPostWalkCommands: (cmds: string[]) => { this.movementManager.postWalkCommands = cmds; },
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
    public readonly commandProcessor = new CommandProcessor(this);

    get aliases(): AliasList { return this.commandProcessor.aliases; }
    set aliases(v: AliasList) { this.commandProcessor.aliases = v; }
    attackCommand = DEFAULT_ATTACK_COMMAND;
    drawWeaponCommand = DEFAULT_DRAW_WEAPON_COMMAND;

    public readonly keyBindingManager = new KeyBindingManager(this);

    get lampBind() { return this.keyBindingManager.lampBind; }
    set lampBind(v) { this.keyBindingManager.lampBind = v; }

    get attackBind() { return this.keyBindingManager.attackBind; }
    set attackBind(v) { this.keyBindingManager.attackBind = v; }

    get supportBind() { return this.keyBindingManager.supportBind; }
    set supportBind(v) { this.keyBindingManager.supportBind = v; }

    get moveModeBind() { return this.keyBindingManager.moveModeBind; }
    set moveModeBind(v) { this.keyBindingManager.moveModeBind = v; }

    get customBinds() { return this.keyBindingManager.customBinds; }
    set customBinds(v) { this.keyBindingManager.customBinds = v; }

    get tempBinds() { return this.keyBindingManager.tempBinds; }
    set tempBinds(v) { this.keyBindingManager.tempBinds = v; }
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

        const initialSettings = characterStorage.get('settings');
        this.attackCommand = normalizeAttackCommand(initialSettings?.attackCommand);
        this.drawWeaponCommand = normalizeDrawWeaponCommand(initialSettings?.drawWeaponCommand);

        characterStorage.onChange('settings', (settings) => {
            const detail = (settings ?? defaultSettings) as Record<string, any>;
            this.attackCommand = normalizeAttackCommand(detail?.attackCommand);
            this.drawWeaponCommand = normalizeDrawWeaponCommand(detail?.drawWeaponCommand);
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

        // Apply initial uiSettings from storage
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
        this.keyBindingManager.setTempBind(index, command);
    }

    send(command: string, echo: boolean = true, options?: CommandOptions) {
        if (echo && this.clientAdapter.shouldEchoCommand()) {
            this.echoCommand(command);
        }
        this.clientAdapter.send(command, false, options)
    }

    echoCommand(command: string): void {
        let display = this.ObjectManager.resolveObjectIds(command);
        const groupCover = gmcp?.char?.options?.group_cover;
        if (/^zaslon /.test(command) && typeof groupCover === 'number' && groupCover > 1) {
            display += ` &lt;${groupCover}&gt;`;
        }
        if (display == "") return
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

    attackAllEnemies() {
        this.AttackController.attackAllEnemies((id) => this.AllyProtection.isAlly(id));
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
        return this.commandProcessor.sendCommand(command, echo, options, skipMapParse, fromUserInput);
    }

    sendGMCP(type: string, payload?: any) {
        this.clientAdapter.sendGmcp(type, payload)
    }

    registerCommandHook(id: string, callback: CommandHookCallback, priority?: number): void {
        this.commandProcessor.registerCommandHook(id, callback, priority);
    }

    unregisterCommandHook(id: string): boolean {
        return this.commandProcessor.unregisterCommandHook(id);
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
