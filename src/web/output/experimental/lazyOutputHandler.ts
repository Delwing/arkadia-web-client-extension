import type { OutputMessageHandler } from '@shared/dom/outputMessageHandler.ts';

/**
 * A handle for an output that mounts asynchronously (a lazily loaded
 * experiment): calls made before it is up are dropped, later ones forwarded.
 */
export function lazyOutputHandler(loading: Promise<OutputMessageHandler>): OutputMessageHandler {
    let handler: OutputMessageHandler | null = null;
    loading.then((h) => { handler = h; }, (err) => console.error('[output] experimental output failed to mount', err));
    return {
        destroy: () => handler?.destroy(),
        isSplitView: () => handler?.isSplitView() ?? false,
        suppressSplitView: (ms) => handler?.suppressSplitView(ms),
        appendNode: (node, rebuild) => handler?.appendNode(node, rebuild),
    };
}
