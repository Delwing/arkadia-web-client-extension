import { CommandLineEngine } from '@web/commandInput/CommandLineEngine';
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

function makeEngine(opts: Partial<{ history: string[]; clearInputOnSend: boolean }> = {}): Harness {
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
        getOutputWords: () => [],
        getClearInputOnSend: () => h.clearInputOnSend,
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
