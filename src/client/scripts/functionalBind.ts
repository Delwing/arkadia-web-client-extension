import Client from "../Client";
import {AnsiAwareBuffer, FormatStateSnapshot} from "@client/ansi/FormatState";
import {bindMatches} from "@modules/core/keymapTypes";

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const ALT_LABEL = isMac ? '⌥' : 'ALT';

export const LINE_START_EVENT = 'line-start';

export interface FunctionalBindOptions {
    key?: string;
    label?: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

export function formatLabel(options: FunctionalBindOptions) {
    let key = options.key ?? '';
    if (key.startsWith('Digit')) {
        key = key.substring(5);
    } else if (key.startsWith('Key')) {
        key = key.substring(3);
    } else if (key === 'BracketRight') {
        key = ']';
    } else if (key === 'BracketLeft') {
        key = '[';
    } else if (key === 'Backquote') {
        key = '`';
    }
    const parts = [] as string[];
    if (options.ctrl) parts.push('CTRL');
    if (options.alt) parts.push(ALT_LABEL);
    if (options.shift) parts.push('SHIFT');
    parts.push(key);
    return parts.join('+');
}

function createBindMessage(label: string, printable: string, callback: () => void): AnsiAwareBuffer {
    // Using xterm proper palette colors: 49 = #00ffaf, 222 = #ffd787
    const bindColor: FormatStateSnapshot = { foreground: { space: 'hex', color: '#00ffaf' } };
    const labelColor: FormatStateSnapshot = { foreground: { space: 'hex', color: '#ffd787' } };

    const buffer = new AnsiAwareBuffer();
    buffer.append('\t', undefined);
    buffer.append('bind ', bindColor);
    buffer.append(label, labelColor);
    buffer.append(': ', bindColor);
    buffer.append(printable, undefined);

    const printableIndex = buffer.text.indexOf(printable);
    if (printableIndex !== -1) {
        buffer.createLink([printableIndex, printableIndex + printable.length], {
            onClick: callback,
            title: `Kliknij aby wykonać: ${printable}`
        });
    }

    return buffer;
}

export class FunctionalBind {

    private client: Client;
    private functionalBind = () => {
    };
    private currentPrintable: string | null = null;
    private printedInMessage = false;
    private isLocationBound = false;
    private key: string;
    private label: string;
    private ctrl: boolean;
    private alt: boolean;
    private shift: boolean;

    constructor(client: Client, options: FunctionalBindOptions = {}) {
        this.client = client;
        this.key = options.key ?? 'BracketRight';
        this.label = options.label ?? (this.key === 'BracketRight' ? ']' : this.key);
        this.ctrl = !!options.ctrl;
        this.alt = !!options.alt;
        this.shift = !!options.shift;
        window.addEventListener('keydown', (ev) => {
            if (bindMatches(ev, { key: this.key, ctrl: this.ctrl, alt: this.alt, shift: this.shift })) {
                this.functionalBind();
                ev.preventDefault();
            }
        })

        this.client.on(LINE_START_EVENT, () => this.newMessage());
        this.client.on('enterLocation', () => this.onLocationChange());
    }

    private onLocationChange() {
        if (this.isLocationBound) {
            this.clear();
        }
    }

    newMessage() {
        this.printedInMessage = false;
    }

    set(printable: string | null, callback?: () => void, clearAfterUse: boolean = false, locationBound: boolean = false) {
        this.isLocationBound = locationBound;
        if (callback) {
            this.functionalBind = () => {
                callback();
                if (clearAfterUse) {
                    this.clear();
                }
            };
        } else {
            this.functionalBind = () => {
                this.client.sendCommand(printable);
                if (clearAfterUse) {
                    this.clear();
                }
            };
        }

        if (this.currentPrintable === printable) {
            if (printable && !this.printedInMessage) {
                const line = createBindMessage(this.label, printable, this.functionalBind);
                this.client.println(line);
                this.printedInMessage = true;
            }
            return;
        }
        this.currentPrintable = printable;
        this.printedInMessage = true;
        if (printable) {
            const line = createBindMessage(this.label, printable, this.functionalBind);
            this.client.println(line);
        }
    }

    clear() {
        this.functionalBind = () => {
        };
        this.currentPrintable = null;
        this.printedInMessage = false;
        this.isLocationBound = false;
    }

    updateOptions(options: FunctionalBindOptions = {}) {
        if (options.key) {
            this.key = options.key;
        }
        if (options.label) {
            this.label = options.label;
        } else if (options.key) {
            this.label = options.key === 'BracketRight' ? ']' : options.key;
        }
        if (options.ctrl !== undefined) this.ctrl = !!options.ctrl;
        if (options.alt !== undefined) this.alt = !!options.alt;
        if (options.shift !== undefined) this.shift = !!options.shift;
    }

    getLabel() {
        return this.label;
    }

}
