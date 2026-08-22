import Client from "./Client";
import {AnsiAwareBuffer, FormatStateSnapshot} from "@client/ansi/FormatState";
import {bindMatches} from "@modules/core/keymapTypes";
import {shouldIgnoreGlobalKeybind} from "./keybindGuard";
import type {FunctionalBindCategory} from "./functionalBindCategories";
import {CATEGORY_LABELS, FUNCTIONAL_BIND_CATEGORIES} from "./functionalBindCategories";

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
    } else if (key === 'Equal') {
        key = '=';
    } else if (key === 'Minus') {
        key = '-';
    }
    const parts = [] as string[];
    if (options.ctrl) parts.push('CTRL');
    if (options.alt) parts.push(ALT_LABEL);
    if (options.shift) parts.push('SHIFT');
    parts.push(key);
    return parts.join('+');
}

export function createBindMessage(label: string, printable: string, callback: () => void): AnsiAwareBuffer {
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

/**
 * A single functional bind slot. Holds the current printable command and callback.
 * Does NOT own a keydown listener – the FunctionalBindManager dispatches to the
 * appropriate slot based on priority.
 */
export class FunctionalBind {

    private client: Client;
    private functionalBind = () => {
    };
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

        this.client.on(LINE_START_EVENT, () => this.newMessage());
    }

    newMessage() {
        this.printedInMessage = false;
    }

    set(printable: string | null, callback?: () => void, clearAfterUse: boolean = false) {
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
    }

    /** Execute the current bind action. Called by FunctionalBindManager on keydown. */
    execute() {
        this.functionalBind();
    }

    /** Whether this slot has an active (non-null) printable set. */
    isActive(): boolean {
        return this.currentPrintable !== null;
    }

    updateOptions(options: FunctionalBindOptions = {}) {
        const oldLabel = this.label;
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

        // When the label changes, invalidate the cached printable so the next
        // set() call reprints the bind message with the updated label.
        if (this.label !== oldLabel) {
            this.currentPrintable = null;
            this.printedInMessage = false;
        }
    }

    getKey(): string {
        return this.key;
    }

    getCtrl(): boolean {
        return this.ctrl;
    }

    getAlt(): boolean {
        return this.alt;
    }

    getShift(): boolean {
        return this.shift;
    }

    getLabel() {
        return this.label;
    }

}

/**
 * Manages multiple FunctionalBind instances, one per category.
 *
 * When a key is pressed, the manager finds the highest-priority active bind
 * whose key matches and executes it. Lower-priority binds are preserved and
 * will surface when higher-priority ones are cleared.
 *
 * Backward-compatible: `set(printable, callback, clearAfterUse)` targets the
 * 'default' category. Use `setCategory(category, ...)` to target a specific one.
 */
export class FunctionalBindManager {
    private categories: Map<FunctionalBindCategory, FunctionalBind> = new Map();
    /** Tracks the order in which categories were last set. Higher = more recent. */
    private setOrder: Map<FunctionalBindCategory, number> = new Map();
    private setCounter = 0;

    constructor(client: Client) {
        // Create one FunctionalBind per category
        for (const cat of FUNCTIONAL_BIND_CATEGORIES) {
            this.categories.set(cat, new FunctionalBind(client));
            this.setOrder.set(cat, 0);
        }

        // Single keydown listener for all functional binds
        window.addEventListener('keydown', (ev) => {
            this.handleKeyDown(ev);
        });

        // Helper bind support
        const catMap: Record<string, FunctionalBindCategory> = {
            functional: 'default',
            functionalGates: 'gates',
            functionalTransport: 'transport',
            functionalLoot: 'loot',
        };
        // Helper bind support — only for the helper system
        client.on('helperBind', (bindName) => {
            const cat = catMap[bindName];
            if (cat) {
                const bind = this.categories.get(cat);
                if (bind?.isActive()) {
                    bind.execute();
                }
            }
        });

        // Button macro support — execute the highest-priority active bind.
        // Uses a dedicated event so helperBind stays for the helper system only.
        client.on('executeFunctionalBind', () => {
            this.findBestBind()?.execute();
        });
    }

    /** Find the highest-priority active bind, optionally filtered by a key event. */
    private findBestBind(ev?: KeyboardEvent): FunctionalBind | null {
        let bestOrder = -1;
        let bestBind: FunctionalBind | null = null;

        for (const [cat, bind] of this.categories) {
            if (!bind.isActive()) continue;

            if (ev) {
                const matches = bindMatches(ev, {
                    key: bind.getKey(),
                    ctrl: bind.getCtrl(),
                    alt: bind.getAlt(),
                    shift: bind.getShift(),
                });
                if (!matches) continue;
            }

            const order = this.setOrder.get(cat) ?? 0;
            if (order > bestOrder) {
                bestOrder = order;
                bestBind = bind;
            }
        }

        return bestBind;
    }

    private handleKeyDown(ev: KeyboardEvent) {
        // Shared, UI-agnostic guard: don't fire while typing in a non-command
        // field or when the UI suppresses keybinds (e.g. an open modal). The
        // command input opts back in via [data-command-input].
        if (shouldIgnoreGlobalKeybind()) {
            return;
        }

        const bestBind = this.findBestBind(ev);
        if (bestBind) {
            bestBind.execute();
            ev.preventDefault();
        }
    }

    // ===== Backward-compatible API (targets 'default' category) =====

    /** Set the default functional bind. Backward-compatible with old callers. */
    set(printable: string | null, callback?: () => void, clearAfterUse?: boolean): void {
        this.setCategory('default', printable, callback, clearAfterUse);
    }

    /** Clear the default functional bind. */
    clear(): void {
        this.clearCategory('default');
    }

    /** Reset message-print tracking on all categories. */
    newMessage(): void {
        for (const bind of this.categories.values()) {
            bind.newMessage();
        }
    }

    /** Get the label for the default category's bind key. */
    getLabel(): string {
        return this.categories.get('default')!.getLabel();
    }

    /**
     * Update key options for a category.
     * When called without category, updates the 'default' category.
     */
    updateOptions(options: FunctionalBindOptions, category?: FunctionalBindCategory): void {
        const cat = category ?? 'default';
        this.categories.get(cat)?.updateOptions(options);
    }

    // ===== Category-aware API =====

    /** Set a functional bind for a specific category. */
    setCategory(category: FunctionalBindCategory, printable: string | null, callback?: () => void, clearAfterUse?: boolean): void {
        this.categories.get(category)?.set(printable, callback, clearAfterUse ?? false);
        if (printable !== null) {
            this.setOrder.set(category, ++this.setCounter);
        }
    }

    /** Clear a specific category's bind. */
    clearCategory(category: FunctionalBindCategory): void {
        this.categories.get(category)?.clear();
        this.setOrder.set(category, 0);
    }

    /** Get the FunctionalBind instance for a category. */
    getCategory(category: FunctionalBindCategory): FunctionalBind | undefined {
        return this.categories.get(category);
    }

    /** Get the label for a specific category's bind key. */
    getCategoryLabel(category: FunctionalBindCategory): string {
        return this.categories.get(category)?.getLabel() ?? '';
    }

    /** Get the human-readable name for a category. */
    getCategoryName(category: FunctionalBindCategory): string {
        return CATEGORY_LABELS[category];
    }
}
