import type {CommandOptions} from "@client/scripts/commandPreserveCaseMode";

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

const HISTORY_STORAGE_KEY = 'commandHistory';
const MAX_SAVED_ENTRIES = 1000;

export class CommandInputController {
    private readonly deps: CommandInputDeps;
    private readonly input: HTMLTextAreaElement;

    // Mudlet-style history: newest at index 0, sentinel "" at front after submit
    private historyList: string[] = [];
    private historyBuffer = 0;

    // Prefix auto-completion (Up/Down with partial text)
    private autoCompletionCount = -1;

    // Tab completion from output buffer
    private tabCompletionTyped = '';
    private tabCompletionCount = -1;
    private tabCompletionOld = '';
    private userKeptOnTyping = false;

    private tabCompleteBlacklist = new Set<string>();

    private abortController: AbortController | null = null;

    // Mobile swipe state
    private swipeStartX: number | null = null;
    private swipeStartY: number | null = null;

    // Mobile Enter interception
    private shiftDown = false;

    constructor(deps: CommandInputDeps) {
        this.deps = deps;
        this.input = deps.messageInput;
        this.loadHistory();

        (window as any).__historyDebug = () => this.getDebugState();
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

        this.deps.sendButton.addEventListener('click', () => this.submit(false), o);

        this.deps.passwordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.submit();
            }
        }, o);

        document.addEventListener('keydown', (e) => this.handleGlobalKeyDown(e), o);
        this.input.addEventListener('keydown', (e) => this.handleKeyDown(e), o);
        this.input.addEventListener('input', () => this.handleInput(), o);

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
                this.submit();
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
                this.historyMove(dx < 0 ? 'up' : 'down');
            }
        }, o);

        // History buttons — select input first so browse mode is used
        if (this.deps.historyUpButton) {
            this.deps.historyUpButton.addEventListener('click', () => {
                this.selectEntireInput();
                this.historyMove('up');
            }, o);
        }
        if (this.deps.historyDownButton) {
            this.deps.historyDownButton.addEventListener('click', () => {
                this.selectEntireInput();
                this.historyMove('down');
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

    // ── Submit ─────────────────────────────────────────────────────────

    submit(focus = true): void {
        const rawValue = this.deps.isPasswordMode()
            ? this.deps.passwordInput.value
            : this.input.value;
        const commands = rawValue.split('\n');
        const clearInputOnSend = this.deps.getClearInputOnSend();

        if (rawValue.length > 0) {
            if (!this.deps.isPasswordMode()) {
                // Store the full input as a single history entry
                const historyEntry = rawValue;

                // Remove old sentinels and deduplicate
                this.historyList = this.historyList.filter(h => h !== '' && h !== historyEntry);
                this.historyList.unshift(historyEntry);
                // Add single sentinel at front
                this.historyList.unshift('');

                // Send each line as a separate command
                for (const command of commands) {
                    this.deps.sendCommand(command, true, undefined, false, true);
                }

                // Reset state. When the input is cleared, browsing starts from
                // the sentinel (index 0). When the just-sent command stays in the
                // input, it lives at index 1, so point the buffer there — otherwise
                // the first ArrowUp would just re-load the command already shown.
                this.historyBuffer = clearInputOnSend ? 0 : 1;
                this.resetAllCompletionState();

                if (clearInputOnSend) {
                    this.input.value = '';
                    if (focus) this.input.focus();
                } else {
                    if (focus) this.selectEntireInput();
                }

                this.saveHistory();
            } else {
                // Password mode: send and clear
                for (const command of commands) {
                    this.deps.sendCommand(command, true, undefined, false, true);
                }
                this.deps.passwordInput.value = '';
                if (focus) this.deps.passwordInput.focus();
            }
        } else {
            // Empty input: send empty command
            this.deps.sendCommand('', true);
            if (focus) {
                if (clearInputOnSend) {
                    this.input.focus();
                } else {
                    this.selectEntireInput();
                }
            }
        }
    }

    // ── History Navigation ─────────────────────────────────────────────

    historyMove(direction: 'up' | 'down'): void {
        if (this.deps.isPasswordMode()) return;
        if (this.historyList.length === 0) return;

        this.resetTabCompletionState();

        if (this.allTextIsSelected() || this.inputIsEmpty()) {
            // Mode 1: Full browse - cycle through entire history
            this.browseHistory(direction);
        } else {
            // Mode 2: Prefix auto-complete
            if (direction === 'up') {
                this.autoCompletionCount++;
            } else {
                this.autoCompletionCount--;
            }
            this.handleAutoCompletion();
        }
    }

    private browseHistory(direction: 'up' | 'down'): void {
        if (direction === 'up') {
            if (this.historyBuffer < this.historyList.length - 1) {
                this.historyBuffer++;
            } else {
                return;
            }
        } else {
            if (this.historyBuffer > 0) {
                this.historyBuffer--;
            } else {
                return;
            }
        }

        const entry = this.historyList[this.historyBuffer];
        if (entry !== undefined) {
            this.input.value = entry;
            this.selectEntireInput();
        }
    }

    // ── Prefix Auto-Completion (Up/Down with partial text) ─────────────

    private handleAutoCompletion(): void {
        // Get the typed portion (strip any selected suffix that was from previous completion)
        const selStart = this.input.selectionStart ?? 0;
        const selEnd = this.input.selectionEnd ?? this.input.value.length;
        const typedText = selStart < selEnd ? this.input.value.substring(0, selStart) : this.input.value;

        if (this.autoCompletionCount < 0) {
            this.autoCompletionCount = -1;
            // Restore just the typed text
            this.input.value = typedText;
            this.moveCursorToEnd();
            return;
        }

        // Search for matching entries starting from autoCompletionCount
        let matchesFound = 0;
        for (let i = 0; i < this.historyList.length; i++) {
            const entry = this.historyList[i];
            if (entry && entry.startsWith(typedText) && entry !== typedText) {
                if (matchesFound === this.autoCompletionCount) {
                    this.input.value = entry;
                    this.setCursorPosition(typedText.length);
                    this.selectFromCursorToEnd(typedText.length);
                    return;
                }
                matchesFound++;
            }
        }

        // No match found at this count - clamp
        if (matchesFound > 0) {
            this.autoCompletionCount = matchesFound - 1;
            // Retry with clamped count
            let found = 0;
            for (let i = 0; i < this.historyList.length; i++) {
                const entry = this.historyList[i];
                if (entry && entry.startsWith(typedText) && entry !== typedText) {
                    if (found === this.autoCompletionCount) {
                        this.input.value = entry;
                        this.setCursorPosition(typedText.length);
                        this.selectFromCursorToEnd(typedText.length);
                        return;
                    }
                    found++;
                }
            }
        } else {
            // No matches at all
            this.autoCompletionCount = -1;
        }
    }

    // ── Tab Completion (from output buffer) ────────────────────────────

    handleTabCompletion(forward: boolean): void {
        const inputVal = this.input.value;

        // First tab press: snapshot the typed text
        if (this.tabCompletionCount === -1) {
            this.tabCompletionTyped = inputVal;
            this.tabCompletionOld = '';
        }

        // Find the last word being typed
        const lastWordMatch = this.tabCompletionTyped.match(/\b(\w+)$/);
        if (!lastWordMatch) return;
        const lastWord = lastWordMatch[1];
        const prefix = this.tabCompletionTyped.substring(0, this.tabCompletionTyped.length - lastWord.length);

        // Build word list: plugin suggestions first, then output words (newest first)
        const words: string[] = [];
        const suggestions = this.deps.getCommandLineSuggestions();
        for (const s of suggestions) {
            if (s) words.push(s);
        }
        const outputWords = this.getOutputWords();
        for (let i = outputWords.length - 1; i >= 0; i--) {
            words.push(outputWords[i]);
        }

        // Remove blacklisted words (case-insensitive)
        const filteredWords: string[] = [];
        const seen = new Set<string>();
        for (const word of words) {
            const lower = word.toLowerCase();
            if (this.tabCompleteBlacklist.has(lower)) continue;
            if (!lower.startsWith(lastWord.toLowerCase())) continue;
            if (lower === lastWord.toLowerCase()) continue; // exclude exact match
            if (seen.has(lower)) continue;
            seen.add(lower);
            filteredWords.push(word);
        }

        if (filteredWords.length === 0) return;

        // Cycle through matches
        if (forward) {
            this.tabCompletionCount++;
            if (this.tabCompletionCount >= filteredWords.length) {
                this.tabCompletionCount = 0;
            }
        } else {
            this.tabCompletionCount--;
            if (this.tabCompletionCount < 0) {
                this.tabCompletionCount = filteredWords.length - 1;
            }
        }

        const match = filteredWords[this.tabCompletionCount];
        const newValue = prefix + match;
        this.tabCompletionOld = newValue;
        this.input.value = newValue;
        this.moveCursorToEnd();
    }

    // ── Keyboard Handlers ──────────────────────────────────────────────

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
            this.submit();
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
            this.historyMove('up');
        } else if (e.key === 'ArrowDown' && !e.ctrlKey) {
            e.preventDefault();
            this.historyMove('down');
        } else if (e.key === 'Tab') {
            e.preventDefault();
            this.handleTabCompletion(!e.shiftKey);
        } else if (e.key === 'Escape') {
            this.selectEntireInput();
            this.historyBuffer = 0;
            this.resetAllCompletionState();
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
            this.historyBuffer = 0;
            this.autoCompletionCount = -1;
            this.tabCompletionCount = -1;
            // Chop tabCompletionTyped if it has content
            if (this.tabCompletionTyped.length > 0) {
                this.tabCompletionTyped = this.tabCompletionTyped.substring(0, this.tabCompletionTyped.length - 1);
            }
        } else {
            // Normal key: reset tab completion on next typing
            this.resetTabCompletionState();
        }
    }

    private handleInput(): void {
        // Reset history browsing when user types
        this.historyBuffer = 0;
        this.autoCompletionCount = -1;
        this.userKeptOnTyping = true;
    }

    // ── Output Word Extraction ────────────────────────────────────────

    private getOutputWords(): string[] {
        const wrapper = this.deps.outputWrapper;
        const children = wrapper.children;
        const words: string[] = [];

        // Read last 500 lines from output DOM
        const startIdx = Math.max(0, children.length - 500);
        for (let i = startIdx; i < children.length; i++) {
            const text = children[i].textContent ?? '';
            const lineWords = text.match(/\w+/g);
            if (lineWords) {
                for (const w of lineWords) {
                    if (w.length >= 2) {
                        words.push(w);
                    }
                }
            }
        }

        return words;
    }

    // ── State Management ──────────────────────────────────────────────

    private resetTabCompletionState(): void {
        this.tabCompletionCount = -1;
        this.tabCompletionTyped = '';
        this.tabCompletionOld = '';
        this.userKeptOnTyping = false;
    }

    private resetAllCompletionState(): void {
        this.autoCompletionCount = -1;
        this.resetTabCompletionState();
    }

    // ── Persistence ───────────────────────────────────────────────────

    private loadHistory(): void {
        try {
            const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed)) {
                    // Stored newest-first; filter to valid non-empty strings, then add single sentinel
                    this.historyList = parsed.filter((e: unknown) => typeof e === 'string' && e !== '');
                    // Add single sentinel at front
                    this.historyList.unshift('');
                }
            }
        } catch {
            // ignore corrupt storage
        }
    }

    private saveHistory(): void {
        try {
            const toSave = this.historyList.slice(0, MAX_SAVED_ENTRIES);
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(toSave));
        } catch {
            // ignore storage errors
        }
    }

    // ── Input Helpers ─────────────────────────────────────────────────

    private selectEntireInput(): void {
        if (document.activeElement !== this.input) {
            this.input.focus();
        }
        this.input.setSelectionRange(0, this.input.value.length);
    }

    private allTextIsSelected(): boolean {
        if (document.activeElement !== this.input) return false;
        const start = this.input.selectionStart;
        const end = this.input.selectionEnd;
        return start === 0 && end === this.input.value.length && end > 0;
    }

    private inputIsEmpty(): boolean {
        return this.input.value.length === 0;
    }

    private moveCursorToEnd(): void {
        const len = this.input.value.length;
        this.input.setSelectionRange(len, len);
    }

    private setCursorPosition(pos: number): void {
        this.input.setSelectionRange(pos, pos);
    }

    private selectFromCursorToEnd(cursorPos: number): void {
        this.input.setSelectionRange(cursorPos, this.input.value.length);
    }

    // ── Blacklist ─────────────────────────────────────────────────────

    addToBlacklist(word: string): void {
        this.tabCompleteBlacklist.add(word.toLowerCase());
    }

    removeFromBlacklist(word: string): void {
        this.tabCompleteBlacklist.delete(word.toLowerCase());
    }

    // ── Debug ─────────────────────────────────────────────────────────

    getDebugState(): object {
        return {
            historyList: [...this.historyList],
            historyBuffer: this.historyBuffer,
            autoCompletionCount: this.autoCompletionCount,
            tabCompletionTyped: this.tabCompletionTyped,
            tabCompletionCount: this.tabCompletionCount,
            tabCompletionOld: this.tabCompletionOld,
            userKeptOnTyping: this.userKeptOnTyping,
        };
    }
}
