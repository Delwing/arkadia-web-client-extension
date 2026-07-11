import type {CommandOptions} from "@client/scripts/commandPreserveCaseMode";
import {CommandLineEngine} from "./CommandLineEngine";
import {domEditableField} from "./editableField";
import {localStorageHistoryStore} from "./commandHistoryStore";
import {harvestOutputWords} from "./outputWords";

export interface CommandInputDeps {
    messageInput: HTMLTextAreaElement;
    passwordInput: HTMLInputElement;
    outputWrapper: HTMLElement;
    sendButton: HTMLButtonElement;
    historyUpButton: HTMLButtonElement | null;
    historyDownButton: HTMLButtonElement | null;
    sendCommand: (command: string, echo: boolean, options?: CommandOptions, skipMapParse?: boolean, fromUserInput?: boolean) => void;
    isPasswordMode: () => boolean;
    getCommandLineSuggestions: () => string[];
    getClearInputOnSend: () => boolean;
}

/**
 * Stock-web adapter around the headless {@link CommandLineEngine}. This class
 * owns only the web-chrome specifics — the concrete DOM elements and ids, the
 * password-field element swap, output-buffer word harvesting, and web-only keys
 * (PageUp/PageDown scroll, global Enter, touch swipe). All command-line logic
 * (history, completion, submit-splitting, password branching) lives in the
 * engine and is shared with other UIs (see `alt-ui/hooks/useCommandLine.ts`).
 */
export class CommandInputController {
    private readonly deps: CommandInputDeps;
    private readonly input: HTMLTextAreaElement;
    private readonly engine: CommandLineEngine;

    private abortController: AbortController | null = null;

    // Mobile swipe state
    private swipeStartX: number | null = null;
    private swipeStartY: number | null = null;

    // Mobile Enter interception
    private shiftDown = false;

    constructor(deps: CommandInputDeps) {
        this.deps = deps;
        this.input = deps.messageInput;
        this.engine = new CommandLineEngine({
            field: domEditableField(deps.messageInput),
            passwordField: domEditableField(deps.passwordInput),
            sendCommand: deps.sendCommand,
            isPasswordMode: deps.isPasswordMode,
            getCommandLineSuggestions: deps.getCommandLineSuggestions,
            getOutputWords: () => harvestOutputWords(this.deps.outputWrapper),
            getClearInputOnSend: deps.getClearInputOnSend,
            store: localStorageHistoryStore(),
        });

        (window as any).__historyDebug = () => this.engine.getDebugState();
    }

    setPasswordMode(enabled: boolean): void {
        if (enabled) {
            this.input.value = '';
            this.input.style.display = 'none';
            this.deps.passwordInput.style.display = '';
            this.deps.passwordInput.focus();
        } else {
            this.deps.passwordInput.value = '';
            this.deps.passwordInput.style.display = 'none';
            this.input.style.display = '';
            this.input.focus();
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────

    attach(): void {
        this.detach();
        const ac = new AbortController();
        this.abortController = ac;
        const o = {signal: ac.signal};

        this.deps.sendButton.addEventListener('click', () => this.engine.submit(false), o);

        this.deps.passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.engine.submit();
            }
        }, o);

        document.addEventListener('keydown', (e) => this.handleGlobalKeyDown(e), o);
        this.input.addEventListener('keydown', (e) => this.handleKeyDown(e), o);
        this.input.addEventListener('input', () => this.engine.onInput(), o);

        // Mobile Enter interception via beforeinput
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Shift') this.shiftDown = true;
        }, o);
        this.input.addEventListener('keyup', (e) => {
            if (e.key === 'Shift') this.shiftDown = false;
        }, o);
        this.input.addEventListener('beforeinput', (e) => {
            if ((e.inputType === 'insertLineBreak' || e.inputType === 'insertParagraph') && !this.shiftDown) {
                e.preventDefault();
                this.engine.submit();
            }
        }, o);

        // Touch swipe for history on mobile
        this.input.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this.swipeStartX = e.touches[0].clientX;
                this.swipeStartY = e.touches[0].clientY;
            }
        }, {signal: ac.signal, passive: true});

        this.input.addEventListener('touchend', (e) => {
            if (this.swipeStartX === null || this.swipeStartY === null) return;
            const touch = e.changedTouches[0];
            const dx = touch.clientX - this.swipeStartX;
            const dy = touch.clientY - this.swipeStartY;
            this.swipeStartX = null;
            this.swipeStartY = null;
            if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
                e.preventDefault();
                this.engine.historyMove(dx < 0 ? 'up' : 'down');
            }
        }, o);

        // History buttons — select input first so browse mode is used
        if (this.deps.historyUpButton) {
            this.deps.historyUpButton.addEventListener('click', () => {
                this.selectEntireInput();
                this.engine.historyMove('up');
            }, o);
        }
        if (this.deps.historyDownButton) {
            this.deps.historyDownButton.addEventListener('click', () => {
                this.selectEntireInput();
                this.engine.historyMove('down');
            }, o);
        }

        // Focus handler: scroll to bottom and select text
        this.input.addEventListener('focus', () => {
            this.deps.outputWrapper.scrollTop = this.deps.outputWrapper.scrollHeight;
            setTimeout(() => this.input.select());
        }, o);
    }

    detach(): void {
        this.abortController?.abort();
        this.abortController = null;
    }

    // ── Keyboard Handlers (web-chrome specific) ────────────────────────

    private handleGlobalKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Enter') {
            if (e.shiftKey) return;
            const active = document.activeElement as HTMLElement | null;
            const modalOpen = document.querySelector('.modal.show');
            if (modalOpen && (!active || active.id !== 'message-input')) return;
            if (active && active.id !== 'message-input' &&
                (active.matches('input, textarea') || active.isContentEditable)) {
                return;
            }
            e.preventDefault();
            this.engine.submit();
        }
    }

    private handleKeyDown(e: KeyboardEvent): void {
        if (e.key === 'PageUp' || e.key === 'PageDown') {
            const wrapper = this.deps.outputWrapper;
            if (wrapper.scrollHeight <= wrapper.clientHeight) return;
            e.preventDefault();
            const splitBottom = document.getElementById('split-bottom');
            const splitHeight = splitBottom
                ? (splitBottom.offsetHeight || parseFloat(splitBottom.style.height) || wrapper.clientHeight * 0.3)
                : 0;
            const delta = (wrapper.clientHeight - splitHeight) * 0.9;
            wrapper.scrollTop += e.key === 'PageUp' ? -delta : delta;
            return;
        }
        if (e.key === 'ArrowUp' && !e.ctrlKey) {
            e.preventDefault();
            this.engine.historyMove('up');
        } else if (e.key === 'ArrowDown' && !e.ctrlKey) {
            e.preventDefault();
            this.engine.historyMove('down');
        } else if (e.key === 'Tab') {
            e.preventDefault();
            this.engine.handleTabCompletion(!e.shiftKey);
        } else if (e.key === 'Escape') {
            this.engine.onEscape();
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
            this.engine.onEditKey();
        } else {
            // Normal key: reset tab completion on next typing
            this.engine.resetTabCompletionState();
        }
    }

    // ── Input Helpers ─────────────────────────────────────────────────

    private selectEntireInput(): void {
        if (document.activeElement !== this.input) {
            this.input.focus();
        }
        this.input.setSelectionRange(0, this.input.value.length);
    }

    // ── Blacklist / Debug (delegated to the engine) ────────────────────

    addToBlacklist(word: string): void {
        this.engine.addToBlacklist(word);
    }

    removeFromBlacklist(word: string): void {
        this.engine.removeFromBlacklist(word);
    }

    getDebugState(): object {
        return this.engine.getDebugState();
    }
}
