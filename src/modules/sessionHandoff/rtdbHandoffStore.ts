/**
 * The Realtime Database side of the session handoff:
 *
 *   sessionHandoff/{uid}/{character}  SessionRecord (see handoffRecord)
 *
 * The Realtime Database rather than Firestore because this is a small value read
 * and written in the middle of a login, where its lower latency is the point, and
 * because a live listener on it is what tells a device its session was taken.
 */

import type { Database } from 'firebase/database';
import { characterKey, normalizeRecord, type SessionRecord } from './handoffRecord';
import type { HandoffStore } from './sessionHandoff';

type DatabaseApi = typeof import('firebase/database');

export class RtdbHandoffStore implements HandoffStore {
    private offsetMs = 0;
    private online: boolean | null = null;
    private readonly stopOffset: () => void;

    constructor(
        private readonly api: DatabaseApi,
        private readonly db: Database,
        private readonly userId: string,
    ) {
        // Claims and handoffs from different devices are compared by time, so each
        // uses the server's clock rather than its own.
        this.stopOffset = api.onValue(api.ref(db, '.info/serverTimeOffset'), snapshot => {
            const offset = Number(snapshot.val());
            this.offsetMs = Number.isFinite(offset) ? offset : 0;
        });
    }

    now(): number {
        return Date.now() + this.offsetMs;
    }

    private ref(character: string) {
        return this.api.ref(this.db, `sessionHandoff/${this.userId}/${characterKey(character)}`);
    }

    async transact(
        character: string,
        update: (current: SessionRecord | null) => SessionRecord | null | undefined,
    ): Promise<SessionRecord | null> {
        const result = await this.api.runTransaction(
            this.ref(character),
            current => update(normalizeRecord(current)),
            {applyLocally: false},
        );
        return result.committed ? normalizeRecord(result.snapshot.val()) : null;
    }

    watch(character: string, listener: (value: SessionRecord | null) => void): () => void {
        return this.api.onValue(
            this.ref(character),
            snapshot => listener(normalizeRecord(snapshot.val())),
            error => console.warn('[SessionHandoff] watch failed:', error),
        );
    }

    setOnline(online: boolean): void {
        if (online === this.online) return;
        this.online = online;
        if (online) this.api.goOnline(this.db);
        else this.api.goOffline(this.db);
    }

    dispose(): void {
        this.stopOffset();
        this.setOnline(false);
    }
}
