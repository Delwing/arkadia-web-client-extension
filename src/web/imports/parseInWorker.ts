/**
 * Runs one parse in a dedicated worker and terminates it afterwards.
 *
 * Every importer's worker speaks the same protocol: `{type: 'parse', buffer}`
 * in, `{type: 'success', payload}` or `{type: 'error', message}` out. The
 * caller creates the worker itself — Vite only bundles a worker it can see as
 * a literal `new Worker(new URL('…', import.meta.url))`. `extra` adds fields to
 * the message, for workers that need more than the file.
 */
export function parseInWorker<T>(createWorker: () => Worker, buffer: ArrayBuffer, extra?: Record<string, unknown>): Promise<T> {
    const worker = createWorker();
    return new Promise<T>((resolve, reject) => {
        const finish = () => worker.terminate();
        worker.addEventListener('message', (event: MessageEvent) => {
            const data = event.data as { type: 'success'; payload: T } | { type: 'error'; message: string } | undefined;
            if (!data) return;
            finish();
            if (data.type === 'success') resolve(data.payload);
            else reject(new Error(data.message));
        });
        worker.addEventListener('error', (event: ErrorEvent) => {
            finish();
            reject(event.error ?? new Error(event.message));
        });
        worker.postMessage({ ...extra, type: 'parse', buffer }, [buffer]);
    });
}
