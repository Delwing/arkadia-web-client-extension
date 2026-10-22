import type { KVNamespace } from '../src/types';

/** In-memory KV: get/put with metadata, counting writes. */
export function createFakeKV(): KVNamespace & { values: Map<string, { value: string; metadata: unknown }>; puts: number } {
    const values = new Map<string, { value: string; metadata: unknown }>();
    const kv = {
        values,
        puts: 0,
        async getWithMetadata<M>(key: string) {
            const entry = values.get(key);
            return { value: entry?.value ?? null, metadata: (entry?.metadata ?? null) as M | null };
        },
        async put(key: string, value: string, options?: { metadata?: unknown }): Promise<void> {
            kv.puts++;
            values.set(key, { value, metadata: options?.metadata ?? null });
        },
    };
    return kv;
}
