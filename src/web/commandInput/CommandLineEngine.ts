import type {CommandOptions} from "@client/scripts/commandPreserveCaseMode";
import type {EditableField} from "./editableField";
import type {CommandHistoryStore} from "./commandHistoryStore";

export interface CommandLineEngineDeps {
    /** The main (visible) command field. */
    field: EditableField;
    /**
     * The masked field used while the game suppresses echo (password entry).
     * Optional — a UI without password support may omit it; the engine then
     * falls back to the main field, and `isPasswordMode` is expected to stay
     * false for such a UI.
     */
    passwordField?: EditableField;
    /** Send one command line to the client (one call per `\n`-split line). */
    sendCommand: (command: string, echo: boolean, options?: CommandOptions, skipMapParse?: boolean, fromUserInput?: boolean) => void;
    /** Whether the game is currently in password/echo-off mode. */
    isPasswordMode: () => boolean;
    /** Plugin-provided completion suggestions (offered before output words). */
    getCommandLineSuggestions: () => string[];
    /** Words harvested from the output surface, oldest-first, for Tab completion. */
    getOutputWords: () => string[];
    /** Whether the input should be cleared (vs. kept+selected) after sending. */
    getClearInputOnSend: () => boolean;
    /** History persistence. */
    store: CommandHistoryStore;
}

/**
 * Headless command-line logic shared by every UI: the Mudlet-style history ring,
 * prefix auto-completion, Tab completion from the output buffer, multiline
 * submit-splitting, and password-mode branching.
 *
 * It owns no DOM and no listeners. A UI drives it by translating its own
 * keyboard/pointer events into these method calls and injecting an
 * {@link EditableField} + {@link CommandHistoryStore}. The stock web UI
 * (`CommandInputController`) and the alt-ui React hook (`useCommandLine`) are
 * both thin adapters over this class.
 */
export class CommandLineEngine {
    private readonly deps: CommandLineEngineDeps;
    private readonly field: EditableField;

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

    constructor(deps: CommandLineEngineDeps) {
        this.deps = deps;
        this.field = deps.field;
        this.loadHistory();
    }

    // ── Submit ─────────────────────────────────────────────────────────

    submit(focus = true): void {
        const passwordMode = this.deps.isPasswordMode();
        const activeField = passwordMode ? (this.deps.passwordField ?? this.field) : this.field;
        const rawValue = activeField.value;
        const commands = rawValue.split('\n');
        const clearInputOnSend = this.deps.getClearInputOnSend();

        if (rawValue.length > 0) {
            if (!passwordMode) {
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
                    this.field.value = '';
                    if (focus) this.field.focus();
                } else {
                    if (focus) this.selectEntireInput();
                }

                this.saveHistory();
            } else {
                // Password mode: send and clear, never recorded to history
                for (const command of commands) {
                    this.deps.sendCommand(command, true, undefined, false, true);
                }
                activeField.value = '';
                if (focus) activeField.focus();
            }
        } else {
            // Empty input: send empty command
            this.deps.sendCommand('', true);
            if (focus) {
                if (clearInputOnSend) {
                    this.field.focus();
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
            this.field.value = entry;
            this.selectEntireInput();
        }
    }

    // ── Prefix Auto-Completion (Up/Down with partial text) ─────────────

    private handleAutoCompletion(): void {
        // Get the typed portion (strip any selected suffix that was from previous completion)
        const selStart = this.field.selectionStart;
        const selEnd = this.field.selectionEnd;
        const typedText = selStart < selEnd ? this.field.value.substring(0, selStart) : this.field.value;

        if (this.autoCompletionCount < 0) {
            this.autoCompletionCount = -1;
            // Restore just the typed text
            this.field.value = typedText;
            this.moveCursorToEnd();
            return;
        }

        // Search for matching entries starting from autoCompletionCount
        let matchesFound = 0;
        for (let i = 0; i < this.historyList.length; i++) {
            const entry = this.historyList[i];
            if (entry && entry.startsWith(typedText) && entry !== typedText) {
                if (matchesFound === this.autoCompletionCount) {
                    this.field.value = entry;
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
                        this.field.value = entry;
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
        const inputVal = this.field.value;

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
        const outputWords = this.deps.getOutputWords();
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
        this.field.value = newValue;
        this.moveCursorToEnd();
    }

    // ── Editing-state transitions ──────────────────────────────────────

    /** User typed a printable character: reset history browsing. */
    onInput(): void {
        this.historyBuffer = 0;
        this.autoCompletionCount = -1;
        this.userKeptOnTyping = true;
    }

    /** Escape: select all, rewind history browsing, drop completion state. */
    onEscape(): void {
        this.selectEntireInput();
        this.historyBuffer = 0;
        this.resetAllCompletionState();
    }

    /** Backspace/Delete: rewind browsing and chop the tab-completion prefix. */
    onEditKey(): void {
        this.historyBuffer = 0;
        this.autoCompletionCount = -1;
        this.tabCompletionCount = -1;
        // Chop tabCompletionTyped if it has content
        if (this.tabCompletionTyped.length > 0) {
            this.tabCompletionTyped = this.tabCompletionTyped.substring(0, this.tabCompletionTyped.length - 1);
        }
    }

    // ── State Management ──────────────────────────────────────────────

    resetTabCompletionState(): void {
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
        const entries = this.deps.store.load();
        // Stored newest-first without the sentinel; add single sentinel at front.
        this.historyList = entries.filter(e => e !== '');
        this.historyList.unshift('');
    }

    private saveHistory(): void {
        // Persist without the sentinel; the store caps the length.
        this.deps.store.save(this.historyList.filter(e => e !== ''));
    }

    // ── Input Helpers ─────────────────────────────────────────────────

    private selectEntireInput(): void {
        if (!this.field.isFocused()) {
            this.field.focus();
        }
        this.field.setSelection(0, this.field.value.length);
    }

    private allTextIsSelected(): boolean {
        if (!this.field.isFocused()) return false;
        const start = this.field.selectionStart;
        const end = this.field.selectionEnd;
        return start === 0 && end === this.field.value.length && end > 0;
    }

    private inputIsEmpty(): boolean {
        return this.field.value.length === 0;
    }

    private moveCursorToEnd(): void {
        const len = this.field.value.length;
        this.field.setSelection(len, len);
    }

    private setCursorPosition(pos: number): void {
        this.field.setSelection(pos, pos);
    }

    private selectFromCursorToEnd(cursorPos: number): void {
        this.field.setSelection(cursorPos, this.field.value.length);
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
