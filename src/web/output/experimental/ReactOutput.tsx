/**
 * EXPERIMENT — the game output as a React component, to measure against the
 * imperative output (`@shared/dom/outputMessageHandler`). Opt in with
 * `?output=react` or `?output=react-dom` on the stock page; nothing else
 * mounts it. See e2e/output-flood.bench.ts.
 *
 * Both modes render the same markup as the stock output (`div.output_msg >
 * div.output_msg_text > timestamp, type, content`) with the same line cap, so
 * the only thing that differs from the imperative output is how the DOM gets
 * there:
 *   - `react`: pure React. Each ANSI segment is a React `<span>`; hyperlinks
 *     are React event props.
 *   - `react-dom`: React owns the list (keys, trimming, commit), each line's
 *     content is the buffer's own `toDom()` fragment, attached through a ref.
 *
 * Messages land in a mutable store; React reads it through
 * useSyncExternalStore, so every message arriving in one task is committed in
 * one render. Lines are immutable, memoised and keyed, so a render only mounts
 * the new lines and unmounts the trimmed ones.
 *
 * Not in the prototype: the split view (scrollback pane + sticky mirror). The
 * output only pins to the bottom while the user has not scrolled up.
 */
import { memo, useLayoutEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AnsiAwareBuffer, type FormatStateSnapshot } from '@client/ansi/FormatState.ts';
import { applyFlairClass, formatTimestamp, type OutputMessageHandler } from '@shared/dom/outputMessageHandler.ts';

export type ReactOutputMode = 'react' | 'react-dom';

type Message = string | AnsiAwareBuffer;

interface Entry {
    id: number;
    message?: Message;
    type?: string;
    timestamp: number;
    /** A host-appended node (appendNode) instead of a message. */
    node?: HTMLElement;
}

type MessageClient = {
    on(event: 'message', listener: (message?: Message, type?: string, timestamp?: number) => void): void;
    off(event: 'message', listener: (message?: Message, type?: string, timestamp?: number) => void): void;
};

class OutputStore {
    entries: Entry[] = [];
    private version = 0;
    private nextId = 0;
    private listeners = new Set<() => void>();

    constructor(private maxElements: () => number, private trimSlack = 100) {}

    push(entry: Omit<Entry, 'id'>): void {
        this.entries.push({ ...entry, id: this.nextId++ });
        // Trim in batches, like the imperative output.
        const cap = this.maxElements();
        if (this.entries.length > cap + this.trimSlack) {
            this.entries = this.entries.slice(this.entries.length - cap);
        }
        this.version++;
        for (const listener of this.listeners) listener();
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getVersion = () => this.version;
}

function Segments({ buffer }: { buffer: AnsiAwareBuffer }): ReactNode {
    return buffer.getSegments().map((segment, i) => {
        const state: FormatStateSnapshot | undefined = segment.state;
        if (!state) return segment.text;
        const { cssText, className } = buffer.presentState(state);
        const link = state.hyperlink;
        if (!cssText && !className && !link) return segment.text;
        return (
            <span
                key={i}
                ref={cssText ? (el) => { if (el) el.style.cssText = cssText; } : undefined}
                className={className || undefined}
                title={link?.title}
                data-output-clickable={link ? 'true' : undefined}
                onClick={link?.onClick ? (e) => { e.preventDefault(); e.stopPropagation(); link.onClick!(e.nativeEvent); } : undefined}
                onContextMenu={link?.onContextMenu ? (e) => { e.preventDefault(); e.stopPropagation(); link.onContextMenu!(e.nativeEvent); } : undefined}
                onMouseEnter={link?.onMouseEnter ? (e) => link.onMouseEnter!(e.nativeEvent) : undefined}
                onMouseLeave={link?.onMouseLeave ? (e) => link.onMouseLeave!(e.nativeEvent) : undefined}
            >
                {segment.text}
            </span>
        );
    });
}

const PRE_WRAP = { whiteSpace: 'pre-wrap' } as const;

const Line = memo(function Line({ entry, mode }: { entry: Entry; mode: ReactOutputMode }) {
    const rootRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLSpanElement>(null);
    const { message, type, timestamp, node } = entry;

    // What the imperative output does right after building a line: flair class,
    // toDom content (react-dom) and the buffer's onRender hook.
    useLayoutEffect(() => {
        const content = contentRef.current;
        if (rootRef.current) applyFlairClass(rootRef.current, message);
        if (!content || !(message instanceof AnsiAwareBuffer) || message.length === 0) return;
        if (mode === 'react-dom') content.appendChild(message.toDom());
        message.notifyRender(content);
    }, [message, mode]);

    useLayoutEffect(() => {
        if (node && rootRef.current) rootRef.current.appendChild(node);
    }, [node]);

    if (node) return <div ref={rootRef} style={{ display: 'contents' }} />;

    let content: ReactNode = null;
    // A string message is HTML, as in the imperative output.
    const html = typeof message === 'string' && message !== '' ? { __html: message } : undefined;
    if (message === '') {
        content = ' ';
    } else if (message instanceof AnsiAwareBuffer) {
        if (message.length === 0) content = ' ';
        else if (mode === 'react') content = <Segments buffer={message} />;
    }

    return (
        <div ref={rootRef} className={type ? `output_msg ${type}` : 'output_msg'} data-timestamp={timestamp}>
            <div className="output_msg_text">
                <span className="output-timestamp" data-timestamp={timestamp} title={new Date(timestamp).toLocaleString()}>
                    {formatTimestamp(timestamp)}
                </span>
                <span className="output-message-type" data-message-type={type ?? ''} title={type ? `Typ wiadomości: ${type}` : 'Brak typu wiadomości'}>
                    {type && type.length > 0 ? type : '—'}
                </span>
                {html
                    ? <span ref={contentRef} className="output_msg_content" style={PRE_WRAP} dangerouslySetInnerHTML={html} />
                    : <span ref={contentRef} className="output_msg_content" style={PRE_WRAP}>{content}</span>}
            </div>
        </div>
    );
});

function OutputLines({ store, mode, scrollEl }: { store: OutputStore; mode: ReactOutputMode; scrollEl: HTMLElement }) {
    const version = useSyncExternalStore(store.subscribe, store.getVersion);
    const pinned = useRef(true);

    useLayoutEffect(() => {
        const onScroll = () => {
            pinned.current = scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 2;
        };
        scrollEl.addEventListener('scroll', onScroll, { passive: true });
        return () => scrollEl.removeEventListener('scroll', onScroll);
    }, [scrollEl]);

    // After each commit, stay at the bottom unless the user scrolled up.
    useLayoutEffect(() => {
        if (pinned.current) scrollEl.scrollTop = scrollEl.scrollHeight;
    }, [version, scrollEl]);

    return store.entries.map((entry) => <Line key={entry.id} entry={entry} mode={mode} />);
}

/**
 * Mount the React output into `outputWrapper`, ahead of `before` (the split
 * view pane, which stays inert). Returns the same handle the imperative output
 * does, so the host code around it is unchanged.
 */
export function mountReactOutput(
    client: MessageClient,
    { outputWrapper, before, mode, maxElements }: {
        outputWrapper: HTMLElement;
        before: HTMLElement;
        mode: ReactOutputMode;
        maxElements: () => number;
    },
): OutputMessageHandler {
    const store = new OutputStore(maxElements);
    const container = document.createElement('div');
    container.style.display = 'contents';
    outputWrapper.insertBefore(container, before);
    const root = createRoot(container);
    root.render(<OutputLines store={store} mode={mode} scrollEl={outputWrapper} />);

    const onMessage = (message?: Message, type?: string, timestamp?: number) => {
        if (message === undefined || message === null) return;
        store.push({ message, type, timestamp: typeof timestamp === 'number' ? timestamp : Date.now() });
    };
    client.on('message', onMessage);

    return {
        destroy() {
            client.off('message', onMessage);
            root.unmount();
            container.remove();
        },
        isSplitView: () => false,
        suppressSplitView: () => undefined,
        appendNode(node: HTMLElement) {
            store.push({ node, timestamp: Date.now() });
        },
    };
}
