import Triggers from "./Triggers";
import {stripAnsiCodes} from "./stripAnsiCodes";
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
import OutputHandler, {ClickCallbackMap} from "./OutputHandler";
import TeamManager from "./TeamManager";
import ObjectManager from "./ObjectManager";
import {beepSound} from "./sounds";
import "./gmcp";
import {setCurrentCharacter, getItemSync, setItemSync} from "./storage";
import {color, Colors} from "./Colors";
import {SKIP_LINE} from "./ControlConstants";
import {stripPolishCharacters} from "./stripPolishCharacters";
import {openMapContextMenu} from "./contextMenus";
import appEventBus, {ClientEvents} from "./events/app-event-bus";
import {Handler} from "./events/event-bus";

export interface ClientAdapter {
    send(text: string, echo?: boolean): void;

    output(text?: string, type?: string, clickCallbacks?: ClickCallbackMap): void

    sendGmcp(type: string, payload?: any): void
}

export default class Client {
    clientAdapter: ClientAdapter;
    port?: any;
    eventTarget = appEventBus;
    Colors = Colors;
    FunctionalBind = new FunctionalBind(this);
    Triggers = new Triggers(this);
    packageHelper = new PackageHelper(this);
    Map = new MapHelper(this);
    Pausers = new Pausers(this);
    OutputHandler = new OutputHandler(this);
    TeamManager = new TeamManager(this);
    ObjectManager = new ObjectManager();
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
    moveModeBind = {key: "Backquote"} as {
        key: string;
        ctrl?: boolean;
        alt?: boolean;
        shift?: boolean;
    };
    customBinds: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; command: string }[] = [];
    tempBinds: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; command: string | null }[] = [
        {key: 'F4', command: null},
        {key: 'F5', command: null},
    ];
    inLineProcess = false; //TODO figure out something else
    defaultColor = 255;
    buffer: { out: string, type?: string }[] = [];
    suppressMapMoveEvent = false;
    suppressItemEvaluation = false;
    moveMode = 0;
    carriageMode = false;
    moveModeButton?: HTMLInputElement | HTMLButtonElement;


    constructor(clientAdapter: ClientAdapter) {
        this.clientAdapter = clientAdapter

        this.updateContentWidth()
        window.addEventListener('resize', () => this.updateContentWidth())
        appEventBus.on('uiSettings', () => this.updateContentWidth())

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
                this.lampBind = {...lamp}
            }
            const attack = b?.attack
            if (attack) {
                this.attackBind = {...attack}
            }
            const support = b?.support
            if (support) {
                this.supportBind = {...support}
            }
            const moveMode = b?.moveMode
            if (moveMode) {
                this.moveModeBind = {...moveMode}
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

        //TODO check whether this applyBinds is required on both events
        appEventBus.on("settings", (settings) => {
            applyBinds(settings.binds)
        })

        appEventBus.on("binds", (binds) => {
            applyBinds(binds)
        })

        appEventBus.on('uiSettings', (uiSettings) => {
            setXtermPalette(uiSettings.xtermPalette);
        })

        appEventBus.on('gmcp.char.info', event => {
            if (event.name) {
                setCurrentCharacter(event.name);
                const settings = getItemSync("settings")
                if (settings) {
                    appEventBus.emit("settings", )
                }
                // if (this.port) {
                //     ['settings', 'kill_counter', 'deposits', 'containers', 'herb_counts', 'mapperRoomId', 'binds', 'lastLang'].forEach(k => {
                //         this.port!.postMessage({type: 'GET_STORAGE', key: k});
                //     });
                // }
                //TODO initial settings load
            }
            if (typeof event.object_num !== 'undefined') {
                const newNum = String(event.object_num);
                const stored = getItemSync('object_num')?.object_num;
                if (typeof stored !== 'undefined' && String(stored) !== newNum) {
                    appEventBus.emit('reset');
                }
                setItemSync('object_num', newNum);
            }
        })

        appEventBus.on('gmcp.char.colors', event => {
            this.defaultColor = event.text ?? 255;
        })

        appEventBus.on('line', event => {
            this.onLine(event.text, event.type);
        })

        appEventBus.on("output-sent", () => {
            this.flushBuffer()
        })
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

    releaseGuard() {
        this.sendCommand('przestan zaslaniac')
    }

    goOutOfGuard() {
        this.sendCommand('przestan kryc sie za zaslona')
    }

    sendCommand(command: string, echo: boolean = true) {
        if (command) {
            command = stripPolishCharacters(command)
        }
        this.sendEvent('command', command)

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
                    this.sendMovement(part, echo)
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
            this.sendMovement(command, echo)
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

    private sendMovement(command: string, echo: boolean) {
        const moveRes = this.Map.move(command)
        if (moveRes.moved) {
            this.Map.setBlockable(true)
        }
        this.clientAdapter.send(this.applyMoveMode(moveRes.direction, moveRes.moved), echo)
    }

    private applyMoveMode(cmd: string, moved?: boolean): string {
        if (!moved) return cmd
        if (this.carriageMode) return `jedz na ${cmd}`
        if (this.moveMode === 1) return `przemknij ${cmd}`
        if (this.moveMode === 2) return `przemknij z druzyna ${cmd}`
        return cmd
    }

    onLine(line: string, type: string) {
        this.inLineProcess = true
        this.sendEvent(LINE_START_EVENT)
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
        this.buffer.unshift({out: result, type: type})
        this.flushBuffer();
        return result
    }

    flushBuffer() {
        if (this.buffer.length == 0) return

        const emittedCount = this.buffer.length
        this.buffer.forEach(item => {
            const parsed = this.parseClickableTags(item.out)
            this.sendEvent('output', {
                message: parsed.output,
                type: item.type,
                clickCallbacks: parsed.clickCallbacks,
            })
        })
        this.buffer = []
        if (emittedCount > 0) {
            this.sendEvent('output-sent', emittedCount)
        }
    }

    private parseClickableTags(line: string): { output: string; clickCallbacks?: ClickCallbackMap } {
        const openReg = /\{clickOpen:(\d+)(?::([^}]+))?}/g
        const closeReg = /\{clickClose}/g
        const indices = new Set<number>()

        const escapeAttribute = (value: string) => value
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')

        const withOpenTags = line.replace(openReg, (_match, index: string, title?: string) => {
            const parsedIndex = parseInt(index, 10)
            if (!Number.isNaN(parsedIndex)) {
                indices.add(parsedIndex)
            }
            const attrs = [`data-click-index="${index}"`]
            if (title) {
                attrs.push(`data-click-title="${escapeAttribute(title)}"`)
            }
            return `<span ${attrs.join(' ')}>`
        })
        const output = withOpenTags.replace(closeReg, '</span>')
        const callbacks = indices.size ? this.OutputHandler.getCallbacksForIndices(indices) : undefined
        const clickCallbacks = callbacks && Object.keys(callbacks).length ? callbacks : undefined

        return {output, clickCallbacks}
    }

    on<K extends keyof ClientEvents>(type: K, listener: Handler<ClientEvents[K]>) {
        appEventBus.on(type, listener)
        return () => appEventBus.off(type, listener)
    }

    off<K extends keyof ClientEvents>(type: K, listener: Handler<ClientEvents[K]>) {
        appEventBus.off(type, listener)
    }

    sendEvent<K extends keyof ClientEvents>(type: K, payload?: ClientEvents[K]) {
        appEventBus.emit(type, payload)
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

    print(printable: string) {
        if (typeof printable === 'object') {
            printable = JSON.stringify(printable)
        }
        // @ts-ignore
        this.buffer.push({out: printable})
        if (!this.inLineProcess) {
            this.flushBuffer()
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
        if ('serviceWorker' in navigator && navigator.serviceWorker) {
            navigator.serviceWorker.register('sw.js').catch(() => {
            })
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
                    .catch(() => {
                    })
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
