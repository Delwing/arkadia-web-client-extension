import {color} from "../Colors";
import Client from "../Client";

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
    }
    const parts = [] as string[];
    if (options.ctrl) parts.push('CTRL');
    if (options.alt) parts.push('ALT');
    if (options.shift) parts.push('SHIFT');
    parts.push(key);
    return parts.join('+');
}

export class FunctionalBind {

    private client: Client;
    private functionalBind = () => {
    };
    private button?: HTMLInputElement;
    private currentPrintable: string | null = null;
    private printedInMessage = false;
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
            const target = ev.target as HTMLElement | null;
            if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
                return;
            }
            if (
                (ev.code === this.key || ev.key === this.key) &&
                (!!this.ctrl === ev.ctrlKey) &&
                (!!this.alt === ev.altKey) &&
                (!!this.shift === ev.shiftKey)
            ) {
                this.functionalBind();
                ev.preventDefault();
            }
        })

        this.client.addEventListener(LINE_START_EVENT, () => this.newMessage());
    }

    newMessage() {
        this.printedInMessage = false;
    }

    set(printable: string | null, callback?: () => void, clearAfterUse: boolean = false) {
        if (callback) {
            this.functionalBind = () => {
                callback();
                if (clearAfterUse) {
                    this.clear()
                }
            }
        } else {
            this.functionalBind = () => {
                this.client.sendCommand(printable)
                if (clearAfterUse) {
                    this.clear()
                }
            };
        }
        if (this.currentPrintable === printable) {
            if (printable && !this.printedInMessage) {
                const line = `\t${color(49)}bind ${color(222)}${this.label}${color(49)}: ${printable}`;
                const clickable = this.client.OutputHandler.makeClickable(line, printable, callback);
                this.client.println(clickable);
                this.printedInMessage = true;
            }
            return;
        }
        this.currentPrintable = printable;
        this.printedInMessage = true;
        this.button?.remove();
        if (printable) {
            const line = `\t${color(49)}bind ${color(222)}${this.label}${color(49)}: ${printable}`;
            const clickable = this.client.OutputHandler.makeClickable(line, printable, callback);
            this.client.println(clickable);
            this.button = this.client.createButton(printable, callback);
        }
    }

    clear() {
        this.functionalBind = () => {
        };
        this.currentPrintable = null;
        this.printedInMessage = false;
        this?.button?.remove();
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