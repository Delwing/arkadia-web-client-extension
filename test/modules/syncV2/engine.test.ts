import { HybridLogicalClock } from '@modules/userData/hlc';
import { MemoryRecordStore } from '@modules/userData/recordStore';
import type { MergeRule } from '@modules/userData/records';
import { UserDataTracker } from '@modules/userData/tracker';
import { applyCounterChange, type ItemChange, type LocalItem, type UserDataType } from '@modules/userData/types';
import { SyncEngineV2, type SyncEngineTimings, type VisibilitySource } from '@modules/syncV2/engine';
import { MemoryTransport, type BaseDoc, type FoldResult, type LogDoc } from '@modules/syncV2/transport';

class MapType<V> implements UserDataType<V> {
    readonly data = new Map<string, V>();
    constructor(readonly id: string, readonly rule: MergeRule<V>, readonly deletable = false) {}
    readonly scope = 'global' as const;
    read(): LocalItem<V>[] {
        return [...this.data].map(([key, value]) => ({ scope: 'global', key, value }));
    }
    write(changes: ItemChange<V>[]): void {
        for (const change of changes) {
            if (change.deleted) this.data.delete(change.key);
            else if (this.rule.kind === 'counter') {
                this.data.set(change.key, applyCounterChange(this.data.get(change.key) as Record<string, number>, change as ItemChange<Record<string, number>>) as V);
            } else this.data.set(change.key, change.value as V);
        }
    }
}

class FakeVisibility implements VisibilitySource {
    visible = true;
    private listeners = new Set<(visible: boolean) => void>();
    private hideListeners = new Set<() => void>();
    isVisible() { return this.visible; }
    onChange(listener: (visible: boolean) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
    onPageHide(listener: () => void) { this.hideListeners.add(listener); return () => this.hideListeners.delete(listener); }
    set(visible: boolean) { this.visible = visible; this.listeners.forEach(l => l(visible)); }
}

const FAST: Partial<SyncEngineTimings> = { idleMs: 200, watchingMs: 20, watchingTtlMs: 60_000, foldLogBytes: 64 * 1024, directFoldBytes: 32 * 1024 };

interface Device {
    engine: SyncEngineV2;
    aliases: MapType<string>;
    kills: MapType<Record<string, number>>;
    visibility: FakeVisibility;
    errors: unknown[];
}

function makeDevice(id: string, transport: MemoryTransport, options: {
    visible?: boolean;
    timings?: Partial<SyncEngineTimings>;
    passphrase?: () => string | null;
    /** Encryption switched off, the passphrase still known. */
    encrypt?: () => boolean;
    cursors?: Record<string, number>;
} = {}): Device {
    const aliases = new MapType<string>('aliases', { kind: 'newest' }, true);
    const kills = new MapType<Record<string, number>>('kills', { kind: 'counter' });
    const types = [aliases, kills];
    let saved: string | null = null;
    const tracker = new UserDataTracker({
        deviceId: id,
        types,
        store: new MemoryRecordStore(),
        clock: new HybridLogicalClock(id, { load: () => saved, save: s => { saved = s; } }),
    });
    const visibility = new FakeVisibility();
    visibility.visible = options.visible ?? true;
    let cursors: Record<string, number> = { ...options.cursors };
    const errors: unknown[] = [];
    const passphrase = options.passphrase ?? (() => null);
    const engine = new SyncEngineV2({
        deviceId: id,
        tracker,
        types,
        transport,
        encryptionKey: () => (options.encrypt?.() ?? true ? passphrase() : null),
        decryptionKey: passphrase,
        locked: () => false,
        visibility,
        cursors: { load: () => ({ ...cursors }), save: c => { cursors = { ...c }; } },
        timings: { ...FAST, ...options.timings },
        onError: error => errors.push(error),
    });
    return { engine, aliases, kills, visibility, errors };
}

const running: SyncEngineV2[] = [];
function start(...devices: Device[]) {
    for (const d of devices) {
        d.engine.start();
        running.push(d.engine);
    }
}

afterEach(async () => {
    await Promise.all(running.splice(0).map(e => e.stop()));
});

describe('SyncEngineV2', () => {
    it('delivers an edit from the PC to the phone while both are open', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport);
        const phone = makeDevice('phone', transport);
        start(pc, phone);

        pc.aliases.data.set('k', 'kondycja');
        await vi.waitFor(() => expect(phone.aliases.data.get('k')).toBe('kondycja'), { timeout: 3000 });
        expect(pc.errors).toEqual([]);
        expect(phone.errors).toEqual([]);
    });

    it('uploads at once when the tab is hidden, so the device picked up next has everything', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport, { timings: { idleMs: 60_000, watchingMs: 60_000 } });
        const phone = makeDevice('phone', transport, { visible: false });
        start(pc, phone);
        await vi.waitFor(() => expect(transport.listenerCount()).toBe(1));

        pc.aliases.data.set('k', 'kondycja');
        pc.visibility.set(false);
        await vi.waitFor(() => expect(transport.log.batches.some(b => b.device === 'pc' && b.data.includes('kondycja'))).toBe(true));

        // The phone was hidden: no listener, nothing applied until it is shown
        expect(phone.aliases.data.get('k')).toBeUndefined();
        phone.visibility.set(true);
        await vi.waitFor(() => expect(phone.aliases.data.get('k')).toBe('kondycja'));
    });

    it('listens only while visible', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport);
        start(pc);
        await vi.waitFor(() => expect(transport.listenerCount()).toBe(1));
        pc.visibility.set(false);
        await vi.waitFor(() => expect(transport.listenerCount()).toBe(0));
        expect(transport.log.watching.pc).toBeUndefined();
        pc.visibility.set(true);
        await vi.waitFor(() => expect(transport.listenerCount()).toBe(1));
        expect(transport.log.watching.pc).toBeDefined();
    });

    it('uploads faster while another device is watching', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport, { timings: { idleMs: 60_000, watchingMs: 20 } });
        start(pc);
        await vi.waitFor(() => expect(transport.listenerCount()).toBe(1));

        const phone = makeDevice('phone', transport);
        start(phone);
        pc.aliases.data.set('k', 'kondycja');
        // Well before the 60 s idle interval
        await vi.waitFor(() => expect(phone.aliases.data.get('k')).toBe('kondycja'), { timeout: 3000 });
    });

    it('sums counts made on both devices and converges', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport);
        const phone = makeDevice('phone', transport);
        pc.kills.data.set('orka', { count: 2 });
        phone.kills.data.set('orka', { count: 3 });
        start(pc, phone);

        await vi.waitFor(() => {
            expect(pc.kills.data.get('orka')).toEqual({ count: 5 });
            expect(phone.kills.data.get('orka')).toEqual({ count: 5 });
        }, { timeout: 3000 });
    });

    it('folds the log into the base when it grows, and a new device starts from the base', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport, { timings: { foldLogBytes: 300 } });
        start(pc);
        for (let i = 0; i < 10; i += 1) {
            pc.aliases.data.set(`a${i}`, `alias ${i}`);
            pc.kills.data.set('orka', { count: i + 1 });
            await pc.engine.flush();
        }
        await vi.waitFor(() => expect(transport.base).not.toBeNull());
        expect(transport.log.batches.length).toBeLessThan(10);

        const phone = makeDevice('phone', transport);
        start(phone);
        await vi.waitFor(() => {
            expect(phone.aliases.data.size).toBe(10);
            expect(phone.kills.data.get('orka')).toEqual({ count: 10 });
        }, { timeout: 3000 });
    });

    it('folds a first upload too large for the log straight into the base', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport, { timings: { directFoldBytes: 200 } });
        for (let i = 0; i < 20; i += 1) pc.aliases.data.set(`a${i}`, `a long alias number ${i}`);
        start(pc);

        await vi.waitFor(() => expect(transport.base?.data).toContain('a long alias number 19'));
        expect(transport.log.batches).toEqual([]);
        expect(transport.log.folded.pc).toBeGreaterThan(0);
    });

    it('never loses a batch appended while a fold is in progress', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport, { timings: { foldLogBytes: 1 } });
        const phone = makeDevice('phone', transport);
        start(pc, phone);
        await vi.waitFor(() => expect(transport.listenerCount()).toBe(2));

        // The phone appends during the pc's first fold attempt
        const fold = transport.fold.bind(transport);
        let interfered = false;
        transport.fold = async (update: (base: BaseDoc | null, log: LogDoc) => Promise<FoldResult>) => fold(async (base, log) => {
            if (!interfered) {
                interfered = true;
                phone.aliases.data.set('during', 'fold');
                await phone.engine.flush();
            }
            return update(base, log);
        });
        pc.aliases.data.set('before', 'fold');
        await pc.engine.flush();

        const third = makeDevice('third', transport);
        start(third);
        await vi.waitFor(() => {
            expect(third.aliases.data.get('before')).toBe('fold');
            expect(third.aliases.data.get('during')).toBe('fold');
        }, { timeout: 3000 });
    });

    it('still reads data encrypted before encryption was switched off', async () => {
        const transport = new MemoryTransport();
        let encrypt = true;
        const pc = makeDevice('pc', transport, { passphrase: () => 'secret', encrypt: () => encrypt });
        const phone = makeDevice('phone', transport, { passphrase: () => 'secret', encrypt: () => encrypt });
        start(pc);
        pc.aliases.data.set('old', 'sent encrypted');
        await pc.engine.flush();

        encrypt = false;
        pc.aliases.data.set('new', 'sent in the clear');
        await pc.engine.flush();
        expect(transport.log.batches.map(b => b.encrypted)).toEqual([true, false]);

        start(phone);
        await vi.waitFor(() => {
            expect(phone.aliases.data.get('old')).toBe('sent encrypted');
            expect(phone.aliases.data.get('new')).toBe('sent in the clear');
        }, { timeout: 5000 });
    });

    it('clears the cloud and uploads this device\'s data again', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport);
        start(pc);
        pc.aliases.data.set('k', 'kondycja');
        await pc.engine.flush();
        await transport.appendBatch({ device: 'other', fromSeq: 1, toSeq: 1, stamp: 's', encrypted: false, data: '[]' });

        await pc.engine.resetCloud();

        expect(transport.log.batches.map(b => b.device)).toEqual(['pc']);
        expect(transport.log.batches[0].data).toContain('kondycja');
    });

    it('downloads everything again on request and fills in what the device skipped', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport);
        start(pc);
        pc.aliases.data.set('a', 'from pc');
        await pc.engine.flush();

        // The phone believes it already applied everything from the pc (e.g. an apply that failed)
        const phone = makeDevice('phone', transport, { cursors: { pc: 1_000 } });
        start(phone);
        await vi.waitFor(() => expect(transport.listenerCount()).toBe(2));
        expect(phone.aliases.data.get('a')).toBeUndefined();

        await phone.engine.redownload();

        expect(phone.aliases.data.get('a')).toBe('from pc');
    });

    it('encrypts records in the cloud and decrypts them on the other device', async () => {
        const transport = new MemoryTransport();
        const pc = makeDevice('pc', transport, { passphrase: () => 'secret' });
        const phone = makeDevice('phone', transport, { passphrase: () => 'secret' });
        start(pc, phone);

        pc.aliases.data.set('k', 'tajny alias');
        await vi.waitFor(() => expect(phone.aliases.data.get('k')).toBe('tajny alias'), { timeout: 5000 });
        expect(JSON.stringify(transport.log)).not.toContain('tajny alias');
    });
});
