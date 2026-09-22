import type {CommandOptions} from "@client/scripts/commandPreserveCaseMode";
import {CommandLineEngine} from "./CommandLineEngine";
import {domEditableField} from "./editableField";
import {localStorageHistoryStore} from "./commandHistoryStore";
import {harvestOutputWords} from "./outputWords";
import {type ActiveCommandLine, setActiveCommandLine} from "./activeCommandLine";
import {isAnyModalOpen} from "@web/modals/appModal.ts";

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
 * engine and is shared with other UIs (see `forge-ui/hooks/useCommandLine.ts`).
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

    // Set while a history button restores focus, so the focus handler does not
    // select the whole line out from under the engine.
    private suppressFocusSelectAll = false;

    // The output's words, kept until the output changes: the Tab ghost looks them
    // up on every keystroke, and re-reading 500 lines each time is wasted work.
    private outputWords: string[] | null = null;
    private outputObserver: MutationObserver | null = null;

    constructor(deps: CommandInputDeps) {
        this.deps = deps;
        this.input = deps.messageInput;
        this.engine = new CommandLineEngine({
            field: domEditableField(deps.messageInput),
            passwordField: domEditableField(deps.passwordInput),
            sendCommand: deps.sendCommand,
            isPasswordMode: deps.isPasswordMode,
            getCommandLineSuggestions: deps.getCommandLineSuggestions,
            getOutputWords: () => this.getOutputWords(),
            getClearInputOnSend: deps.getClearInputOnSend,
            store: localStorageHistoryStore(),
        });

        (window as any).__historyDebug = () => this.engine.getDebugState();
    }

    /**
     * Clear the field being left and focus the one taking over. Which field is
     * visible is the host's business (CommandLine renders one or the other), so
     * call this once the swap is on screen.
     */
    setPasswordMode(enabled: boolean): void {
        if (enabled) {
            this.input.value = '';
            this.deps.passwordInput.focus();
        } else {
            this.deps.passwordInput.value = '';
            this.input.focus();
        }
    }

    // ── Lifecycle ──────────────────────────────────────────────────────

    attach(): void {
        this.detach();
        const ac = new AbortController();
        this.abortController = ac;
        const o = {signal: ac.signal};

        // Publish this as *the* command line, so anything that needs to send
        // without owning an input (the boss key overlay) borrows this engine
        // rather than standing up a second one over the same history key.
        setActiveCommandLine(this.asActiveCommandLine());

        this.outputObserver = new MutationObserver(() => {
            this.outputWords = null;
        });
        this.outputObserver.observe(this.deps.outputWrapper, {childList: true, subtree: true, characterData: true});

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

        // History buttons — drive the engine exactly like the keyboard arrows do.
        if (this.deps.historyUpButton) this.bindHistoryButton(this.deps.historyUpButton, 'up', o);
        if (this.deps.historyDownButton) this.bindHistoryButton(this.deps.historyDownButton, 'down', o);

        // Focus handler: scroll to bottom and select text
        this.input.addEventListener('focus', () => {
            this.deps.outputWrapper.scrollTop = this.deps.outputWrapper.scrollHeight;
            if (this.suppressFocusSelectAll) return;
            // select() focuses too: if focus has moved on meanwhile (a window
            // opening focuses its own field), leave it there.
            setTimeout(() => {
                if (document.activeElement === this.input) this.input.select();
            });
        }, o);
    }

    /**
     * Wire one of the on-screen history arrows to the engine.
     *
     * The engine picks browse vs. prefix auto-completion from the field's focus
     * and selection, so a tap has to leave both exactly as the keyboard would
     * find them. Cancelling `pointerdown` keeps the caret in the textarea (the
     * click still fires — only the compatibility mouse events, and with them the
     * focus shift, are suppressed). Without it the field is already blurred when
     * the click lands, the engine reads "nothing selected", and a half-typed
     * command browses from the newest entry instead of completing its prefix.
     *
     * The selection is snapshotted anyway, for the case where focus did move (a
     * browser that ignores the cancel, or the button reached by keyboard);
     * putting it back must not trip the focus handler's select-all, which would
     * turn the very next press back into a full browse.
     */
    private bindHistoryButton(button: HTMLButtonElement, direction: 'up' | 'down', o: AddEventListenerOptions): void {
        let selection: [number, number] | null = null;

        button.addEventListener('pointerdown', (e) => {
            if (document.activeElement !== this.input) {
                selection = null;
                return;
            }
            selection = [this.input.selectionStart, this.input.selectionEnd];
            e.preventDefault();
        }, o);

        button.addEventListener('click', () => {
            if (document.activeElement !== this.input) {
                this.suppressFocusSelectAll = true;
                this.input.focus();
                this.suppressFocusSelectAll = false;
                if (selection) this.input.setSelectionRange(selection[0], selection[1]);
            }
            this.engine.historyMove(direction);
        }, o);
    }

    private getOutputWords(): string[] {
        // Only cached while observed; otherwise nothing would tell us it went stale.
        if (!this.outputObserver) return harvestOutputWords(this.deps.outputWrapper);
        return this.outputWords ??= harvestOutputWords(this.deps.outputWrapper);
    }

    detach(): void {
        this.abortController?.abort();
        this.abortController = null;
        this.outputObserver?.disconnect();
        this.outputObserver = null;
        this.outputWords = null;
        setActiveCommandLine(null);
    }

    /**
     * Expose this controller's engine as a borrowable command line.
     *
     * Each operation stages the borrower's text on the real field, drives the
     * engine, then hands back whatever the field ended up holding. The field is
     * cleared after a submit regardless of `clearInputOnSend`: the text was
     * never typed here, so leaving it behind (which the setting would do) would
     * put a stray command in the input the user has to notice and delete.
     */
    private asActiveCommandLine(): ActiveCommandLine {
        return {
            submit: (text: string) => {
                this.input.value = text;
                this.engine.submit(false);
                this.input.value = '';
            },
            historyMove: (text: string, direction: 'up' | 'down') => {
                this.input.value = text;
                this.engine.historyMove(direction);
                return this.input.value;
            },
            tabComplete: (text: string, forward: boolean) => {
                this.input.value = text;
                this.engine.handleTabCompletion(forward);
                return this.input.value;
            },
            reset: () => {
                this.input.value = '';
                // Rewind history browsing and completion state, not just the
                // text. `submit` leaves historyBuffer pointing mid-ring (at 1
                // when clearInputOnSend is off), so a borrower that only
                // cleared the field would find its very first ArrowUp already
                // at the end of history and silently do nothing. NOT
                // `onEscape()`: that also focuses this input, stealing the
                // caret from whatever the borrower is about to focus.
                this.engine.resetHistoryBrowsing();
            },
        };
    }

    // ── Keyboard Handlers (web-chrome specific) ────────────────────────

    private handleGlobalKeyDown(e: KeyboardEvent): void {
        if (e.key === 'Enter') {
            if (e.shiftKey) return;
            const active = document.activeElement as HTMLElement | null;
            const modalOpen = isAnyModalOpen();
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

    /** What the next Tab would append to the current line (see the engine). */
    peekTabCompletion(): string | null {
        return this.engine.peekTabCompletion(this.input.value);
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
