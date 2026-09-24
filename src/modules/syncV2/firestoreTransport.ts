/**
 * Firestore implementation of the sync v2 transport:
 *
 *   users/{uid}/syncV2/log        { batches[], folded, watching }
 *   users/{uid}/syncV2/base       { schemaVersion, folded, encrypted, updatedAt, data, chunks }
 *   users/{uid}/syncV2/base__{n}  { data }   only when the base outgrows one document
 *
 * See docs/dev/SYNC_V2_PLAN.md, section 8.1.
 */

import type { DocumentReference, Firestore } from 'firebase/firestore';
import { emptyLog, type BaseDoc, type FoldResult, type LogDoc, type SyncBatch, type SyncTransport } from './transport';

/** Characters of base data per document; well under Firestore's 1 MiB limit. */
export const BASE_CHUNK_CHARS = 700_000;

export function splitChunks(data: string, size = BASE_CHUNK_CHARS): string[] {
    if (data.length <= size) return [data];
    const chunks: string[] = [];
    for (let i = 0; i < data.length; i += size) chunks.push(data.slice(i, i + size));
    return chunks;
}

function toLog(data: Record<string, unknown> | undefined): LogDoc {
    if (!data) return emptyLog();
    return {
        batches: Array.isArray(data.batches) ? data.batches as SyncBatch[] : [],
        folded: (data.folded as Record<string, number> | undefined) ?? {},
        watching: (data.watching as Record<string, number> | undefined) ?? {},
    };
}

export class FirestoreTransport implements SyncTransport {
    constructor(
        private readonly db: Firestore,
        private readonly userId: string,
    ) {}

    private async ref(name: string): Promise<DocumentReference> {
        const { doc } = await import('firebase/firestore');
        return doc(this.db, 'users', this.userId, 'syncV2', name);
    }

    subscribeLog(onLog: (log: LogDoc) => void, onError: (error: unknown) => void): () => void {
        let unsubscribe: (() => void) | null = null;
        let cancelled = false;
        void (async () => {
            const { onSnapshot } = await import('firebase/firestore');
            const ref = await this.ref('log');
            if (cancelled) return;
            unsubscribe = onSnapshot(ref, snapshot => onLog(toLog(snapshot.data())), onError);
        })().catch(onError);
        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }

    async appendBatch(batch: SyncBatch): Promise<void> {
        const { arrayUnion, setDoc } = await import('firebase/firestore');
        await setDoc(await this.ref('log'), { batches: arrayUnion(batch) }, { merge: true });
    }

    async setWatching(device: string, since: number | null): Promise<void> {
        const { deleteField, setDoc } = await import('firebase/firestore');
        await setDoc(await this.ref('log'), { watching: { [device]: since ?? deleteField() } }, { merge: true });
    }

    async readBase(): Promise<BaseDoc | null> {
        const { getDoc } = await import('firebase/firestore');
        const snapshot = await getDoc(await this.ref('base'));
        const data = snapshot.data();
        if (!data) return null;
        const chunks = typeof data.chunks === 'number' ? data.chunks : 1;
        const parts = [data.data as string];
        for (let i = 1; i < chunks; i += 1) {
            const part = await getDoc(await this.ref(`base__${i}`));
            parts.push((part.data()?.data as string | undefined) ?? '');
        }
        return {
            schemaVersion: 1,
            folded: (data.folded as Record<string, number> | undefined) ?? {},
            encrypted: data.encrypted === true,
            updatedAt: (data.updatedAt as number | undefined) ?? 0,
            data: parts.join(''),
        };
    }

    async fold(update: (base: BaseDoc | null, log: LogDoc) => Promise<FoldResult>): Promise<void> {
        const { runTransaction } = await import('firebase/firestore');
        const logRef = await this.ref('log');
        const baseRef = await this.ref('base');
        await runTransaction(this.db, async tx => {
            const logSnap = await tx.get(logRef);
            const baseSnap = await tx.get(baseRef);
            const baseData = baseSnap.data();
            const oldChunks = typeof baseData?.chunks === 'number' ? baseData.chunks : 1;
            let base: BaseDoc | null = null;
            if (baseData) {
                const parts = [baseData.data as string];
                for (let i = 1; i < oldChunks; i += 1) {
                    const part = await tx.get(await this.ref(`base__${i}`));
                    parts.push((part.data()?.data as string | undefined) ?? '');
                }
                base = {
                    schemaVersion: 1,
                    folded: (baseData.folded as Record<string, number> | undefined) ?? {},
                    encrypted: baseData.encrypted === true,
                    updatedAt: (baseData.updatedAt as number | undefined) ?? 0,
                    data: parts.join(''),
                };
            }

            const result = await update(base, toLog(logSnap.data()));
            const chunks = splitChunks(result.base.data);
            tx.set(baseRef, {
                schemaVersion: 1,
                folded: result.base.folded,
                encrypted: result.base.encrypted,
                updatedAt: result.base.updatedAt,
                data: chunks[0],
                chunks: chunks.length,
            });
            for (let i = 1; i < chunks.length; i += 1) {
                tx.set(await this.ref(`base__${i}`), { data: chunks[i] });
            }
            for (let i = chunks.length; i < oldChunks; i += 1) {
                tx.delete(await this.ref(`base__${i}`));
            }
            tx.set(logRef, { batches: result.keep, folded: result.folded }, { merge: true });
        });
    }
}
