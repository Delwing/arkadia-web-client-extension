import Triggers from "./Triggers";
import { stripAnsiCodes } from "./stripAnsiCodes";
import PackageHelper from "./PackageHelper";
import MapHelper from "./MapHelper";
import InlineCompassRose from "./scripts/inlineCompassRose";
import Pausers from "./Pausers";
import {Howl} from "howler";
import {mudletColorLine, setXtermPalette} from "./Colors";
import {
    FunctionalBind,
    LINE_START_EVENT,
    formatLabel,
} from "./scripts/functionalBind";
import OutputHandler from "./OutputHandler";
import TeamManager from "./TeamManager";
import ObjectManager from "./ObjectManager";
import {beepSound} from "./sounds";
import {attachGmcpListener} from "./gmcp";
import { setCurrentCharacter } from "./storage";
import {color, Colors} from "./Colors";
import {SKIP_LINE} from "./ControlConstants";
import {stripPolishCharacters} from "./stripPolishCharacters";
import eventBus from "./eventBus";

export interface ClientAdapter {
    send(text: string, echo?: boolean): void;

    output(text?: string, type?: string): void

    sendGmcp(type: string, payload?: any): void

    parseAnsiPatterns(text: string): string;

    flushMessageBuffer(): void
}

export default class Client {
    clientAdapter: ClientAdapter;
    port?: any;
    eventTarget = eventBus;
    Colors = Colors;
    FunctionalBind = new FunctionalBind(this);
    Triggers = new Triggers(this);
    packageHelper = new PackageHelper(this);
    Map = new MapHelper(this);
    Pausers = new Pausers(this);
    OutputHandler = new OutputHandler(this);
    TeamManager = new TeamManager(this);
    ObjectManager = new ObjectManager(this);
    inlineCompassRose = new InlineCompassRose(this);
    panel = document.getElementById("panel_buttons_bottom");
    contentWidth = 0;
    sounds: Record<string, Howl> = {
        beep: new Howl({
            src: beepSound,
            preload: true,
        }),
    };
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
    supportBind = {key: "KeyQ", ctrl: true} as {
        key: string;
        ctrl?: boolean;
        alt?: boolean;
        shift?: boolean;
    };
    customBinds: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; command: string }[] = [];
    inLineProcess = false; //TODO figure out something else
    defaultColor = 255;
    buffer: { out: string, type?: string }[] = [];
    suppressMapMoveEvent = false;
    suppressItemEvaluation = false;
    moveMode = 0;
    moveModeButton?: HTMLInputElement;


    constructor(clientAdapter: ClientAdapter, port: any) {
        this.clientAdapter = clientAdapter
        attachGmcpListener(this);

        window.addEventListener('extension-message', (ev: Event) => {
            const data: any = (ev as CustomEvent).detail;
            if (data && data.data !== undefined) {
                this.eventTarget.dispatchEvent(new CustomEvent(data.type, {detail: data.data}))
            }
        })

        this.updateContentWidth()
        window.addEventListener('resize', () => this.updateContentWidth())
        this.addEventListener('uiSettings', () => this.updateContentWidth())

        Object.values(this.sounds).forEach((sound) => sound.load())

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
                    this.sendCommand(`zabij ob_${id}`)
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
            const custom = b?.custom
            if (custom) {
                this.customBinds = [...custom]
            } else {
                this.customBinds = []
            }
        }

        this.addEventListener('settings', (ev: CustomEvent) => {
            applyBinds(ev.detail?.binds)
        })

        this.addEventListener('binds', (ev: CustomEvent) => {
            applyBinds(ev.detail)
        })

        this.addEventListener('uiSettings', (ev: CustomEvent) => {
            if (ev.detail?.xtermPalette) {
                setXtermPalette(ev.detail.xtermPalette);
            }
        })

        this.addEventListener('gmcp.char.info', (ev: CustomEvent) => {
            if (ev.detail?.name) {
                setCurrentCharacter(ev.detail.name);
                if (this.port) {
                    ['settings', 'kill_counter', 'deposits', 'containers', 'herb_counts', 'mapperRoomId', 'binds', 'lastLang'].forEach(k => {
                        this.port!.postMessage({ type: 'GET_STORAGE', key: k });
                    });
                }
            }
        })

        this.addEventListener('gmcp.char.colors', (ev: CustomEvent) => {
            this.defaultColor = ev.detail.text ?? 255
        })

        this.addEventListener('output-sent', () => {
            if (this.buffer.length == 0) return
            this.buffer.forEach(item => this.clientAdapter.output(item.out, item.type))
            this.sendEvent('buffer-sent', this.buffer.length)
            this.buffer = []
        })

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

    connect(port: any, initial: boolean) {
        if (initial) {
            port.postMessage({type: 'GET_STORAGE', key: 'scripts'})
        }
        this.port = port
        this.eventTarget.dispatchEvent(new CustomEvent('port-connected'))
        console.log("Client connected to background service.")
    }

    addEventListener(event: string, listener: (arg: CustomEvent) => void, options?: AddEventListenerOptions | boolean) {
        const reference = listener
        this.eventTarget.addEventListener(event, reference, options)
        return () => this.eventTarget.removeEventListener(event, reference, options)
    }

    removeEventListener(event: string, listener: EventListenerOrEventListenerObject | null) {
        this.eventTarget.removeEventListener(event, listener)
    }

    send(command: string, echo: boolean = true) {
        this.clientAdapter.send(command, echo)
    }

    support() {
        this.sendCommand('wesprzyj')
        const id = this.TeamManager.getLeaderId?.()
        if (id) {
            this.sendCommand(`wesprzyj ob_${id}`)
        }
    }

    sendCommand(command: string, echo: boolean = true) {
        if (command) {
            command = stripPolishCharacters(command)
        }
        this.eventTarget.dispatchEvent(new CustomEvent('command', {detail: command}))

        let preparse = command
        command = this.Map.parseCommand(command)
        command = this.expandObjectShortcuts(command)
        if (command.startsWith('echo ')) {
            this.print(mudletColorLine(command.substring(5)))
            return
        }
        const split = command.split(/[#;]/)
        if (split.length > 1) {
            split.forEach(part => {
                if (part !== preparse) {
                    this.sendCommand(part, echo)
                } else {
                    const moveRes = this.Map.move(part)
                    this.clientAdapter.send(this.applyMoveMode(moveRes.direction, moveRes.moved), echo)
                }
            })
            return
        }

        const isAlias = this.aliases.find(alias => {
            const matches = command.match(alias.pattern)
            if (matches) {
                alias.callback(matches)
                return true
            }
            return false
        })
        if (!isAlias) {
            if (command.trim().startsWith('/')) {
                this.print(mudletColorLine(`--- <tomato>Nieznany alias<reset>: ${command}`))
                return
            }
            const moveRes = this.Map.move(command)
            this.clientAdapter.send(this.applyMoveMode(moveRes.direction, moveRes.moved), echo)
        }
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

    private applyMoveMode(cmd: string, moved?: boolean): string {
        if (!moved) return cmd
        if (this.moveMode === 1) return `przemknij ${cmd}`
        if (this.moveMode === 2) return `przemknij z druzyna ${cmd}`
        return cmd
    }

    onLine(line: string, type: string) {
        this.inLineProcess = true
        this.eventTarget.dispatchEvent(new CustomEvent(LINE_START_EVENT))
        const ansiRegex = /\x1b\[[0-9;]*m/g

        line = this.Triggers.parseMultiline(line, type)
        let split = line.split('\n')
        if (stripAnsiCodes(split[split.length - 1]) === '') {
            split.pop()
        }
        let result = split.map(partial => this.Triggers.parseLine(partial, type)).filter(line => line !== SKIP_LINE).join('\n')
        if (!result.startsWith("\x1b")) {
            result = color(255) + result
        }
        const restore: string[] = []
        const stack: string[] = []
        const matches = Array.from(result.matchAll(ansiRegex))
        const resetMatches = Array.from(result.matchAll(/\x1b\[0m/g))
        const trailingCount = resetMatches.length === 1 && result.trimEnd().endsWith('\x1b[0m') ? 1 : 0
        matches.forEach((match, i) => {
            const seq = match[0]
            const isTrailing = seq === '\x1b[0m' && i >= matches.length - trailingCount
            if (seq === '\x1b[0m') {
                if (isTrailing) {
                    restore.push('\x1b[0m')
                } else {
                    stack.pop()
                    const prev = stack[stack.length - 1]
                    if (prev) {
                        restore.push(prev)
                    } else {
                        restore.push(color(this.defaultColor) || '\x1b[0m')
                    }
                }
            } else {
                stack.push(seq)
            }
        })
        let index = 0
        result = result.replace(/\x1b\[0m/g, () => restore[index++] || '\x1b[0m')
        this.inLineProcess = false
        return result
    }

    sendEvent(type: string, payload?: any) {
        this.eventTarget.dispatchEvent(new CustomEvent(type, {detail: payload}))
        window.dispatchEvent(new CustomEvent(type, {detail: payload}))
    }

    createEvent(type, payload) {
        return {
            type: type,
            data: payload,
        }
    }

    print(printable: string) {
        if (typeof printable === 'object') {
            printable = JSON.stringify(printable)
        }
        // @ts-ignore
        const text = Text.parse_patterns(printable)
        this.buffer.push({out: text})
        if (!this.inLineProcess) {
            this.sendEvent('output-sent', 1)
        }
    }

    println(printable: string) {
        this.print('\n')
        this.print(printable)
        this.print('\n')
    }

    createButton(name: string, callback: () => void) {
        let button = document.createElement('input')
        button.value = name
        button.type = 'button'
        button.className = 'panel_button button k-button'
        button.onclick = callback
        this.panel?.appendChild(button)
        return button
    }

    playSound(key: string) {
        const sound = this.sounds[key]
        if (!sound) {
            return
        }
        const play = () => {
            sound.stop()
            sound.play()
        }
        if (sound.state() === 'loaded') {
            play()
        } else {
            sound.once('load', play)
            sound.load()
        }
    }

    enableNotifications() {
        if (typeof Notification === 'undefined') {
            return
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
            new Notification(message)
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
