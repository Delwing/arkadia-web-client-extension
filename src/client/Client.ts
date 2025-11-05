import Triggers from "./Triggers";
import MapHelper from "@shared/map/MapHelper";
import Pausers from "./Pausers";
import {Colors, mudletColorLine, setXtermPalette} from "@modules/core/Colors";
import {formatLabel, FunctionalBind, LINE_START_EVENT,} from "./scripts/functionalBind";
import OutputHandler from "./OutputHandler";
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
import {DEFAULT_ATTACK_COMMAND, normalizeAttackCommand} from "./utils/attackCommand";
import {DEFAULT_DRAW_WEAPON_COMMAND, normalizeDrawWeaponCommand} from "./utils/drawWeaponCommand";
import SoundManager from "./SoundManager";
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

    output(text?: string, type?: string): void

    sendGmcp(type: string, payload?: any): void

    parseAnsiPatterns(text: string): string;

    flushMessageBuffer(): void

    emit(event: string, ...args: any[]): void;
}

export default class Client {
    clientAdapter: ClientAdapter;
    port?: any;
    Colors = Colors;
    FunctionalBind = new FunctionalBind(this);
    Triggers = new Triggers(this);
    Map = new MapHelper({
        on: this.on.bind(this),
        sendCommand: this.sendCommand.bind(this),
        sendEvent: this.sendEvent.bind(this),
        getSuppressMapMoveEvent: () => this.suppressMapMoveEvent,
        setSuppressMapMoveEvent: (value: boolean) => {
            this.suppressMapMoveEvent = value;
        },
        functionalBind: this.FunctionalBind,
    });
    Pausers = new Pausers(this);
    OutputHandler = new OutputHandler(this);
    TeamManager = new TeamManager(this);
    ObjectManager = new ObjectManager(this);
    panel = document.getElementById("panel_buttons_bottom");
    contentWidth = 0;
    commandLineSuggestions: string[] = [];
    private soundManager = new SoundManager(this);
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
    herbManager?: HerbManagerApi;


    constructor(clientAdapter: ClientAdapter, port: any) {
        this.clientAdapter = clientAdapter
        attachGmcpListener(this);

        this.updateContentWidth();
        window.addEventListener('resize', () => this.updateContentWidth());
        this.on('uiSettings', () => this.updateContentWidth());

        window.addEventListener('keydown', (ev) => {
            if (
                (ev.code === this.lampBind.key || ev.key === this.lampBind.key) &&
                !!this.lampBind.ctrl === ev.ctrlKey &&
                !!this.lampBind.alt === ev.altKey &&
                !!this.lampBind.shift === ev.shiftKey
            ) {
                this.sendCommand('napelnij lampe olejem')
                ev.preventDefault()
            }
            if (
                (ev.code === this.attackBind.key || ev.key === this.attackBind.key) &&
                !!this.attackBind.ctrl === ev.ctrlKey &&
                !!this.attackBind.alt === ev.altKey &&
                !!this.attackBind.shift === ev.shiftKey
            ) {
                const id = this.TeamManager.getAttackTargetId?.()
                if (id) {
                    const command = `${this.attackCommand} ob_${id}`;
                    this.sendCommand(command)
                }
                ev.preventDefault()
            }
            if (
                (ev.code === this.supportBind.key || ev.key === this.supportBind.key) &&
                !!this.supportBind.ctrl === ev.ctrlKey &&
                !!this.supportBind.alt === ev.altKey &&
                !!this.supportBind.shift === ev.shiftKey
            ) {
                this.support()
                ev.preventDefault()
            }
            this.customBinds.forEach(cb => {
                if (
                    (ev.code === cb.key || ev.key === cb.key) &&
                    !!cb.ctrl === ev.ctrlKey &&
                    !!cb.alt === ev.altKey &&
                    !!cb.shift === ev.shiftKey
                ) {
                    this.sendCommand(cb.command)
                    ev.preventDefault()
                }
            })
            this.tempBinds.forEach(tb => {
                if (!tb.command) {
                    return
                }
                if (
                    (ev.code === tb.key || ev.key === tb.key) &&
                    !!tb.ctrl === ev.ctrlKey &&
                    !!tb.alt === ev.altKey &&
                    !!tb.shift === ev.shiftKey
                ) {
                    this.sendCommand(tb.command)
                    ev.preventDefault()
                }
            })
        })

        const applyBinds = (b: any) => {
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
            applyBinds(detail?.binds);
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
            this.buffer.forEach(item => this.clientAdapter.output(item.out.toHtml(), item.type))
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
        this.sendCommand('wesprzyj')
        const id = this.TeamManager.getLeaderId?.()
        if (id) {
            this.sendCommand(`wesprzyj ob_${id}`)
        }
    }

    releaseGuard() {
        this.sendCommand('przestan zaslaniac')
    }

    goOutOfGuard() {
        this.sendCommand('przestan kryc sie za zaslona')
    }

    async sendCommand(command: string, echo: boolean = true, options?: CommandOptions, skipMapParse: boolean = false): Promise<void> {
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
        const split = command.split(/[#;]/)
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

    private expandObjectShortcuts(command: string): string {
        return command.replace(/@([A-Za-z0-9@]+)/g, (match, short) => {
            const obj = this.ObjectManager.getObjectsOnLocation().find(o => o.shortcut?.toLowerCase() === short.toLowerCase())
            return obj ? `ob_${obj.num}` : match
        })
    }

    private sendMovement(command: string, echo: boolean, options?: CommandOptions) {
        const moveRes = this.Map.move(command)
        if (moveRes.suppress) {
            return
        }
        if (moveRes.moved) {
            this.Map.setBlockable(true)
        }
        const commandToSend = this.applyMoveMode(moveRes.direction, moveRes.moved)
        this.clientAdapter.send(commandToSend, echo, options)
    }

    private applyMoveMode(cmd: string, moved?: boolean): string {
        if (!moved) return cmd
        if (this.carriageMode) return `jedz na ${cmd}`
        if (this.moveMode === 1) return `przemknij ${cmd}`
        if (this.moveMode === 2) return `przemknij z druzyna ${cmd}`
        return cmd
    }

    onLine(line: string, type: string): AnsiAwareBuffer[] {
        const buffer = new AnsiAwareBuffer(line)
        this.inLineProcess = true
        this.sendEvent(LINE_START_EVENT)
        const multilineResult = this.Triggers.parseMultiline(buffer, type)
        if (multilineResult === null) {
            this.inLineProcess = false
            return []
        }

        const split = buffer.splitLines()
        const result = split.map(part => this.Triggers.parseLine(part, type))
        this.inLineProcess = false
        return result
    }

    sendEvent<K extends EventKey>(type: K, ...args: EventParams<K>): void;
    sendEvent(type: string, ...args: unknown[]): void;
    sendEvent(type: string, ...args: unknown[]): void {
        const eventName = type as EventKey;
        (eventBus.emit as (...emitArgs: any[]) => number)(eventName, ...args);
    }

    openMapContextMenu(roomId: number, x: number, y: number) {
        openMapContextMenu(this, roomId, x, y);
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

    createButton(name: string, callback: () => void) {
        const button = document.createElement('input')
        button.value = name
        button.type = 'button'
        button.className = 'panel_button button k-button'
        button.onclick = callback
        this.panel?.appendChild(button)
        return button
    }

    prepareSounds(): Promise<void> {
        return this.soundManager.prepare()
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
