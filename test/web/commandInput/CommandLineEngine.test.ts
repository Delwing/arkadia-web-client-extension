import { CommandLineEngine, type TabCompletionMode } from '@web/commandInput/CommandLineEngine';
import type { EditableField } from '@web/commandInput/editableField';
import type { CommandHistoryStore } from '@web/commandInput/commandHistoryStore';
import { localStorageHistoryStore } from '@web/commandInput/commandHistoryStore';

/** In-memory EditableField standing in for a DOM input/textarea. */
class FakeField implements EditableField {
    value = '';
    selectionStart = 0;
    selectionEnd = 0;
    private focused = false;

    setSelection(start: number, end: number): void {
        this.selectionStart = start;
        this.selectionEnd = end;
    }
    focus(): void {
        this.focused = true;
    }
    isFocused(): boolean {
        return this.focused;
    }
    /** Test helper: mimic the user typing (cursor at end, not fully selected). */
    type(text: string): void {
        this.value = text;
        this.focused = true;
        this.setSelection(text.length, text.length);
    }
    /** Test helper: mimic selecting the whole field (browse mode trigger). */
    selectAll(): void {
        this.focused = true;
        this.setSelection(0, this.value.length);
    }
}

function memoryStore(initial: string[] = []): CommandHistoryStore & { saved: string[] } {
    const state = { saved: [...initial] };
    return {
        saved: state.saved,
        load: () => [...state.saved],
        save: (entries: string[]) => {
            state.saved.length = 0;
            state.saved.push(...entries);
        },
    };
}

interface Harness {
    engine: CommandLineEngine;
    field: FakeField;
    password: FakeField;
    sent: Array<{ command: string; echo: boolean; fromUser?: boolean }>;
    passwordMode: boolean;
    clearInputOnSend: boolean;
    store: CommandHistoryStore & { saved: string[] };
}

function makeEngine(opts: Partial<{ history: string[]; clearInputOnSend: boolean; outputWords: string[]; tabMode: TabCompletionMode }> = {}): Harness {
    const field = new FakeField();
    const password = new FakeField();
    const sent: Harness['sent'] = [];
    const store = memoryStore(opts.history ?? []);
    const h: Harness = {
        field,
        password,
        sent,
        passwordMode: false,
        clearInputOnSend: opts.clearInputOnSend ?? true,
        store,
        engine: null as unknown as CommandLineEngine,
    };
    h.engine = new CommandLineEngine({
        field,
        passwordField: password,
        sendCommand: (command, echo, _opts, _skip, fromUser) => sent.push({ command, echo, fromUser }),
        isPasswordMode: () => h.passwordMode,
        getCommandLineSuggestions: () => [],
        getOutputWords: () => opts.outputWords ?? [],
        getClearInputOnSend: () => h.clearInputOnSend,
        getTabCompletionMode: () => opts.tabMode ?? 'cycle',
        store,
    });
    return h;
}

describe('CommandLineEngine', () => {
    describe('submit', () => {
        it('sends the command as user input and clears when clearInputOnSend', () => {
            const h = makeEngine();
            h.field.type('polnoc');
            h.engine.submit();

            expect(h.sent).toEqual([{ command: 'polnoc', echo: true, fromUser: true }]);
            expect(h.field.value).toBe('');
        });

        it('splits multiline input into one command per line but stores one history entry', () => {
            const h = makeEngine();
            h.field.type('polnoc\nwschod\ndobadaj miecz');
            h.engine.submit();

            expect(h.sent.map(s => s.command)).toEqual(['polnoc', 'wschod', 'dobadaj miecz']);
            // A single ArrowUp recalls the whole block.
            h.field.value = '';
            h.field.selectAll();
            h.engine.historyMove('up');
            expect(h.field.value).toBe('polnoc\nwschod\ndobadaj miecz');
        });

        it('keeps and re-selects the input when clearInputOnSend is off', () => {
            const h = makeEngine({ clearInputOnSend: false });
            h.field.type('zbadaj');
            h.engine.submit();

            expect(h.field.value).toBe('zbadaj');
            expect(h.field.selectionStart).toBe(0);
            expect(h.field.selectionEnd).toBe('zbadaj'.length);
        });

        it('sends an empty command for empty input without touching history', () => {
            const h = makeEngine();
            h.engine.submit();
            expect(h.sent).toEqual([{ command: '', echo: true, fromUser: undefined }]);
            expect(h.store.saved).toEqual([]);
        });

        it('deduplicates repeated commands, keeping the newest at the front', () => {
            const h = makeEngine();
            h.field.type('polnoc');
            h.engine.submit();
            h.field.type('wschod');
            h.engine.submit();
            h.field.type('polnoc');
            h.engine.submit();

            // Persisted newest-first, no sentinel, no duplicate 'polnoc'.
            expect(h.store.saved).toEqual(['polnoc', 'wschod']);
        });
    });

    describe('password mode', () => {
        it('reads/clears the password field and never records history', () => {
            const h = makeEngine();
            h.passwordMode = true;
            h.password.type('sekret');
            h.engine.submit();

            expect(h.sent).toEqual([{ command: 'sekret', echo: true, fromUser: true }]);
            expect(h.password.value).toBe('');
            expect(h.store.saved).toEqual([]);
        });

        it('ignores history navigation while in password mode', () => {
            const h = makeEngine({ history: ['polnoc'] });
            h.passwordMode = true;
            h.field.value = '';
            h.field.selectAll();
            h.engine.historyMove('up');
            expect(h.field.value).toBe('');
        });
    });

    describe('history navigation', () => {
        it('browses the full history newest-first on ArrowUp/Down', () => {
            const h = makeEngine({ history: ['trzeci', 'drugi', 'pierwszy'] });
            h.field.selectAll(); // empty + selected -> browse mode

            h.engine.historyMove('up');
            expect(h.field.value).toBe('trzeci');
            h.engine.historyMove('up');
            expect(h.field.value).toBe('drugi');
            h.engine.historyMove('up');
            expect(h.field.value).toBe('pierwszy');
            h.engine.historyMove('up'); // clamp at oldest
            expect(h.field.value).toBe('pierwszy');

            h.engine.historyMove('down');
            expect(h.field.value).toBe('drugi');
        });

        it('prefix auto-completes from history when partial text is typed', () => {
            const h = makeEngine({ history: ['zabij smoka', 'zbadaj miecz', 'idz na polnoc'] });
            h.field.type('z'); // cursor at end, not fully selected -> prefix mode

            h.engine.historyMove('up');
            expect(h.field.value).toBe('zabij smoka');
            h.engine.historyMove('up');
            expect(h.field.value).toBe('zbadaj miecz');
        });
    });

    describe('tab completion', () => {
        it('completes whole commands from history before words from the output', () => {
            const h = makeEngine({ history: ['zabij smoka', 'zabroniony'], outputWords: ['zabawka'] });
            h.field.type('zab');

            expect(h.engine.peekTabCompletion('zab')).toBe('ij smoka');
            h.engine.handleTabCompletion(true);
            expect(h.field.value).toBe('zabij smoka');
            h.engine.handleTabCompletion(true);
            expect(h.field.value).toBe('zabroniony');
            h.engine.handleTabCompletion(true);
            expect(h.field.value).toBe('zabawka');
            h.engine.handleTabCompletion(true); // wraps back to the newest command
            expect(h.field.value).toBe('zabij smoka');
        });

        it('completes from history past a space, where there is no word to complete', () => {
            const h = makeEngine({ history: ['wejdz na statek'], outputWords: [] });
            expect(h.engine.peekTabCompletion('wejdz na ')).toBe('statek');
        });

        it('matches history case-insensitively and skips multiline entries', () => {
            const h = makeEngine({ history: ['polnoc\nwschod', 'Zabij smoka'] });
            expect(h.engine.peekTabCompletion('zab')).toBe('ij smoka');
            expect(h.engine.peekTabCompletion('pol')).toBeNull();
        });

        it('offers no history on an empty or blank line', () => {
            const h = makeEngine({ history: ['zabij smoka'] });
            expect(h.engine.peekTabCompletion('')).toBeNull();
            expect(h.engine.peekTabCompletion('  ')).toBeNull();
        });

        it('does not offer the command already typed in full', () => {
            const h = makeEngine({ history: ['zabij smoka'] });
            expect(h.engine.peekTabCompletion('zabij smoka')).toBeNull();
        });

        it('completes a command sent in this session', () => {
            const h = makeEngine();
            h.field.type('wejdz na statek');
            h.engine.submit(false);
            expect(h.engine.peekTabCompletion('wejdz')).toBe(' na statek');
        });
    });

    describe('word and whole completion modes', () => {
        it('word mode: Tab takes the hint one word at a time', () => {
            const h = makeEngine({ history: ['zabij duzego smoka'], tabMode: 'word' });
            h.field.type('zab');
            h.engine.handleTabKey(false);
            expect(h.field.value).toBe('zabij ');
            h.engine.handleTabKey(false);
            expect(h.field.value).toBe('zabij duzego ');
            h.engine.handleTabKey(false);
            expect(h.field.value).toBe('zabij duzego smoka');
            h.engine.handleTabKey(false); // nothing left to take
            expect(h.field.value).toBe('zabij duzego smoka');
        });

        it('takes the whole hint and keeps the typed text as typed', () => {
            const h = makeEngine({ history: ['zabij smoka'], tabMode: 'word' });
            h.field.type('ZAB');
            expect(h.engine.acceptHint('all')).toBe(true);
            expect(h.field.value).toBe('ZABij smoka');
            expect(h.engine.acceptHint('all')).toBe(false);
        });

        it('whole mode: Tab takes it all, word acceptance one word', () => {
            const h = makeEngine({ history: ['wejdz na statek'], tabMode: 'whole' });
            h.field.type('wejdz');
            h.engine.acceptHint('word');
            expect(h.field.value).toBe('wejdz na ');
            h.engine.handleTabKey(false);
            expect(h.field.value).toBe('wejdz na statek');
        });

        it('Shift+Tab switches the hint to the next candidate without touching the line', () => {
            const h = makeEngine({ history: ['zabij smoka', 'zabroniony'], outputWords: ['zabawka'], tabMode: 'word' });
            h.field.type('zab');
            expect(h.engine.peekTabCompletion('zab')).toBe('ij smoka');
            h.engine.handleTabKey(true);
            expect(h.field.value).toBe('zab');
            expect(h.engine.peekTabCompletion('zab')).toBe('roniony');
            h.engine.handleTabKey(true);
            expect(h.engine.peekTabCompletion('zab')).toBe('awka');
            h.engine.handleTabKey(true); // wraps
            expect(h.engine.peekTabCompletion('zab')).toBe('ij smoka');
            h.engine.handleTabKey(true);
            h.engine.handleTabKey(false);
            expect(h.field.value).toBe('zabroniony');
        });

        it('typing puts the hint back on the best candidate', () => {
            const h = makeEngine({ history: ['zabij smoka', 'zabroniony'], tabMode: 'word' });
            h.field.type('za');
            h.engine.handleTabKey(true);
            expect(h.engine.peekTabCompletion('zab')).toBe('ij smoka');
        });
    });

    describe('peekTabCompletion', () => {
        it('shows what the next Tab appends, without changing the line', () => {
            // Output words are oldest first; completion prefers the newest.
            const h = makeEngine({ outputWords: ['marynarz', 'statek', 'stary'] });
            h.field.type('wejdz na st');
            expect(h.engine.peekTabCompletion('wejdz na st')).toBe('ary');
            expect(h.field.value).toBe('wejdz na st');

            h.engine.handleTabCompletion(true);
            expect(h.field.value).toBe('wejdz na stary');
        });

        it('offers nothing mid-cycle, with no word to complete, or when nothing fits', () => {
            const h = makeEngine({ outputWords: ['statek', 'stary'] });
            h.field.type('st');
            h.engine.handleTabCompletion(true);
            expect(h.engine.peekTabCompletion(h.field.value)).toBeNull();

            const fresh = makeEngine({ outputWords: ['statek'] });
            expect(fresh.engine.peekTabCompletion('wejdz ')).toBeNull();
            expect(fresh.engine.peekTabCompletion('xyz')).toBeNull();
        });
    });

    describe('loadHistory', () => {
        it('loads persisted entries so they are immediately browsable', () => {
            const h = makeEngine({ history: ['stare polecenie'] });
            h.field.selectAll();
            h.engine.historyMove('up');
            expect(h.field.value).toBe('stare polecenie');
        });
    });
});

describe('localStorageHistoryStore', () => {
    beforeEach(() => localStorage.clear());

    it('round-trips entries and drops the sentinel/non-strings on load', () => {
        const store = localStorageHistoryStore('testHistory');
        store.save(['a', 'b', 'c']);
        expect(store.load()).toEqual(['a', 'b', 'c']);

        localStorage.setItem('testHistory', JSON.stringify(['', 'x', 1, 'y']));
        expect(store.load()).toEqual(['x', 'y']);
    });

    it('caps persisted entries at the configured max', () => {
        const store = localStorageHistoryStore('cappedHistory', 2);
        store.save(['newest', 'middle', 'oldest']);
        expect(store.load()).toEqual(['newest', 'middle']);
    });

    it('returns an empty list for missing or corrupt storage', () => {
        const store = localStorageHistoryStore('missingHistory');
        expect(store.load()).toEqual([]);
        localStorage.setItem('missingHistory', 'not json');
        expect(store.load()).toEqual([]);
    });
});
