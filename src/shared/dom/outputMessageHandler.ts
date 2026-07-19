import {AnsiAwareBuffer} from "@client/ansi/FormatState";

type MessageHandlerClient = {
    on(event: 'message', listener: (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void): void;
    off(event: 'message', listener: (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void): void;
};

export type BuildMessageNode = (
    message: string | AnsiAwareBuffer | undefined,
    type: string | undefined,
    timestamp: number,
) => HTMLElement | null;

type OutputHandlerOptions = {
    outputWrapper: HTMLElement;
    splitBottom: HTMLElement;
    splitHandle: HTMLElement;
    stickyArea: HTMLElement;
    stickyLines: number;
    // Either a fixed cap or a getter resolved on each message, so the setting
    // can be changed at runtime without tearing down the handler.
    maxElements?: number | (() => number);
    trimSlack?: number;
    // Builds the DOM node for one message. Defaults to the stock `.output_msg`
    // wrapper (timestamp/type spans + content). A host with its own message
    // shape (e.g. forge-ui's plain `<p>` lines) supplies its own builder here
    // and gets the rest of the engine — split view, trimming, sticky mirroring —
    // for free. Return `null` to skip the message entirely (e.g. a blank
    // room-name line).
    buildMessageNode?: BuildMessageNode;
    // Fired when the user finishes dragging the split-view resize handle, with
    // the committed height in px. Hosts that persist a preferred height (stock)
    // hook in here; hosts that don't (forge-ui) simply omit it.
    onSplitViewResize?: (heightPx: number) => void;
};

export type OutputMessageHandler = {
    destroy(): void;
    isSplitView(): boolean;
    // Suppresses split-view (re)detection for the given duration. Exposed so a
    // host can debounce its own layout churn (stock suppresses across
    // multibinds show/hide) without reaching into the engine's internals.
    suppressSplitView(durationMs: number): void;
    // Appends an arbitrary node through the same insert/trim/scroll/sticky-mirror
    // pipeline as an incoming client message. `rebuild` — when provided — must
    // return a fresh, independently-live equivalent node; it is called again
    // (never cloned) to populate the sticky-view mirror, so per-node listeners
    // (hyperlinks, click handlers) stay intact there too. Omit it for transient
    // chrome that should not be mirrored (e.g. a connect prompt).
    appendNode(node: HTMLElement, rebuild?: () => HTMLElement): void;
};

const TIMESTAMP_CLASS = 'output-show-timestamps';
const MESSAGE_TYPE_CLASS = 'output-show-message-types';

let timestampsVisible = false;
let messageTypesVisible = false;
let currentOutputWrapper: HTMLElement | null = null;
let currentStickyArea: HTMLElement | null = null;

function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
    return `${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function applyTimestampVisibility() {
    if (currentOutputWrapper) {
        currentOutputWrapper.classList.toggle(TIMESTAMP_CLASS, timestampsVisible);
    }
    if (currentStickyArea) {
        currentStickyArea.classList.toggle(TIMESTAMP_CLASS, timestampsVisible);
    }
}

function applyMessageTypeVisibility() {
    if (currentOutputWrapper) {
        currentOutputWrapper.classList.toggle(MESSAGE_TYPE_CLASS, messageTypesVisible);
    }
    if (currentStickyArea) {
        currentStickyArea.classList.toggle(MESSAGE_TYPE_CLASS, messageTypesVisible);
    }
}

function createTimestampElement(timestamp: number): HTMLSpanElement {
    const timestampEl = document.createElement('span');
    timestampEl.classList.add('output-timestamp');
    timestampEl.textContent = formatTimestamp(timestamp);
    timestampEl.dataset.timestamp = `${timestamp}`;
    timestampEl.title = new Date(timestamp).toLocaleString();
    return timestampEl;
}

function createMessageTypeElement(type: string | undefined): HTMLSpanElement {
    const typeEl = document.createElement('span');
    typeEl.classList.add('output-message-type');
    const label = type && type.length > 0 ? type : '—';
    typeEl.textContent = label;
    typeEl.dataset.messageType = type ?? '';
    typeEl.title = type ? `Typ wiadomości: ${type}` : 'Brak typu wiadomości';
    return typeEl;
}

export function areOutputTimestampsVisible() {
    return timestampsVisible;
}

export function setOutputTimestampVisibility(visible: boolean) {
    timestampsVisible = visible;
    applyTimestampVisibility();
}

export function toggleOutputTimestampVisibility() {
    setOutputTimestampVisibility(!timestampsVisible);
}

export function areOutputMessageTypesVisible() {
    return messageTypesVisible;
}

export function setOutputMessageTypeVisibility(visible: boolean) {
    messageTypesVisible = visible;
    applyMessageTypeVisibility();
}

export function toggleOutputMessageTypeVisibility() {
    setOutputMessageTypeVisibility(!messageTypesVisible);
}

// The stock `.output_msg` wrapper: timestamp + type spans plus the message
// content. The default `buildMessageNode` — hosts with their own message
// shape (forge-ui) supply their own builder instead.
function createMessageWrapper(
    message: string | AnsiAwareBuffer,
    type: string | undefined,
    timestamp: number
): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.classList.add('output_msg');
    if (type) {
        wrapper.classList.add(type);
    }

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('output_msg_text');
    wrapper.dataset.timestamp = `${timestamp}`;

    const timestampEl = createTimestampElement(timestamp);
    const typeEl = createMessageTypeElement(type);
    const contentSpan = document.createElement('span');
    contentSpan.classList.add('output_msg_content');

    // Handle string or AnsiAwareBuffer
    if (typeof message === 'string') {
        if (message === '') {
            // Empty string should render as an empty line (with line height)
            contentSpan.innerHTML = '&nbsp;';
        } else {
            contentSpan.innerHTML = message;
        }
    } else if (message instanceof AnsiAwareBuffer) {
        if (message.length === 0) {
            // Empty buffer should render as an empty line (with line height)
            contentSpan.innerHTML = '&nbsp;';
        } else {
            contentSpan.appendChild(message.toDom());
            message.notifyRender(contentSpan);
        }
    }

    contentSpan.style.whiteSpace = 'pre-wrap';

    messageDiv.appendChild(timestampEl);
    messageDiv.appendChild(typeEl);
    messageDiv.appendChild(contentSpan);
    wrapper.appendChild(messageDiv);

    return wrapper;
}

const defaultBuildMessageNode: BuildMessageNode = (message, type, timestamp) => {
    // Allow empty strings to render as empty lines, but skip undefined/null.
    if (message === undefined || message === null) {
        return null;
    }
    return createMessageWrapper(message, type, timestamp);
};

export function setupOutputMessageHandler(
    client: MessageHandlerClient,
    {
        outputWrapper,
        splitBottom,
        splitHandle,
        stickyArea,
        stickyLines,
        maxElements = 1000,
        trimSlack = 100,
        buildMessageNode = defaultBuildMessageNode,
        onSplitViewResize,
    }: OutputHandlerOptions,
): OutputMessageHandler {
    currentOutputWrapper = outputWrapper;
    currentStickyArea = stickyArea;
    applyTimestampVisibility();
    applyMessageTypeVisibility();

    // Split view is off (pinned to bottom) until the user scrolls up. While on,
    // trimming and auto-scroll pause so the scrollback the user is reading stays
    // put. Debounce window swallows split-view (re)detection right after a
    // change or during output/layout bursts, so the split view doesn't flicker.
    let isSplitViewState = false;
    let suppressSplitViewUntil = 0;

    // Rebuilders for the most recent lines (messages and any host-appended
    // nodes with a `rebuild`). The sticky mirror is re-derived by calling these
    // — each yields a FRESH, live node — instead of cloneNode'ing the visible
    // ones, which would drop per-node listeners (hyperlinks, object menus).
    const recent: Array<() => HTMLElement> = [];

    const refreshStickyArea = () => {
        stickyArea.replaceChildren();
        const start = Math.max(0, recent.length - stickyLines);
        for (let i = start; i < recent.length; i++) {
            stickyArea.appendChild(recent[i]());
        }
    };

    const isAtBottom = () =>
        outputWrapper.scrollTop + outputWrapper.clientHeight + splitBottom.clientHeight >= outputWrapper.scrollHeight - 1;

    const appendNode = (node: HTMLElement, rebuild?: () => HTMLElement) => {
        // Keep splitBottom last: insert output before it, never after.
        outputWrapper.insertBefore(node, splitBottom);

        if (rebuild) {
            recent.push(rebuild);
            while (recent.length > stickyLines) recent.shift();
        }

        const maxElementsValue = typeof maxElements === 'function' ? maxElements() : maxElements;

        // Trim in batches, and only while the user is not scrolled up into split
        // view — otherwise removing the oldest nodes would shift the content
        // they are reading. When split view closes, the accumulated excess
        // drains on the next message via the `> maxElements + trimSlack` check.
        if (!isSplitViewState && outputWrapper.childElementCount - 1 > maxElementsValue + trimSlack) {
            while (outputWrapper.childElementCount - 1 > maxElementsValue) {
                const first = outputWrapper.firstElementChild;
                if (first === splitBottom) {
                    const second = first.nextElementSibling;
                    if (second) {
                        outputWrapper.removeChild(second);
                    } else {
                        break;
                    }
                } else if (first) {
                    outputWrapper.removeChild(first);
                } else {
                    break;
                }
            }
        }

        if (isSplitViewState) {
            if (rebuild) {
                stickyArea.appendChild(rebuild());
                while (stickyArea.childElementCount > stickyLines && stickyArea.firstElementChild) {
                    stickyArea.removeChild(stickyArea.firstElementChild);
                }
            }
        } else {
            // Suppress split view checks to prevent blinking when text is being output.
            suppressSplitViewUntil = Date.now() + 250;
            // Defer scroll to next frame to allow layout changes (e.g., multibinds) to settle first.
            requestAnimationFrame(() => {
                outputWrapper.scrollTop = outputWrapper.scrollHeight;
            });
        }
    };

    const checkSplitView = () => {
        if (Date.now() < suppressSplitViewUntil) return;
        if (isAtBottom()) {
            if (isSplitViewState) {
                isSplitViewState = false;
                suppressSplitViewUntil = Date.now() + 150;
                splitBottom.classList.add('split-hidden');
                stickyArea.replaceChildren();
            }
        } else if (!isSplitViewState) {
            isSplitViewState = true;
            suppressSplitViewUntil = Date.now() + 150;
            splitBottom.classList.remove('split-hidden');
            refreshStickyArea();
        }
    };
    outputWrapper.addEventListener('scroll', checkSplitView);

    // Preemptively open the split view on scroll-up wheel to avoid a 1-frame
    // jitter: 'wheel' fires before the compositor processes the scroll.
    const onWheel = (e: WheelEvent) => {
        if (
            e.deltaY < 0 &&
            !isSplitViewState &&
            Date.now() >= suppressSplitViewUntil &&
            outputWrapper.scrollHeight > outputWrapper.clientHeight &&
            isAtBottom()
        ) {
            isSplitViewState = true;
            suppressSplitViewUntil = Date.now() + 150;
            splitBottom.classList.remove('split-hidden');
            refreshStickyArea();
        }
    };
    outputWrapper.addEventListener('wheel', onWheel, {passive: true});

    // Split-handle drag (resize the sticky footer).
    let isDraggingSplit = false;
    const onSplitDragMove = (e: MouseEvent | TouchEvent) => {
        if (!isDraggingSplit) return;
        e.preventDefault();
        const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
        const wrapperRect = outputWrapper.getBoundingClientRect();
        const newHeight = Math.max(60, wrapperRect.bottom - clientY);
        splitBottom.style.height = `${newHeight}px`;
    };
    const onSplitDragEnd = () => {
        if (!isDraggingSplit) return;
        isDraggingSplit = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', onSplitDragMove);
        document.removeEventListener('mouseup', onSplitDragEnd);
        document.removeEventListener('touchmove', onSplitDragMove);
        document.removeEventListener('touchend', onSplitDragEnd);
        suppressSplitViewUntil = Date.now() + 300;
        refreshStickyArea();
        onSplitViewResize?.(splitBottom.clientHeight);
    };
    const onSplitDragStart = (e: MouseEvent | TouchEvent) => {
        if (e.type === 'mousedown') e.preventDefault();
        isDraggingSplit = true;
        // Hold the split view open for the whole drag.
        suppressSplitViewUntil = Infinity;
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
        document.addEventListener('mousemove', onSplitDragMove);
        document.addEventListener('mouseup', onSplitDragEnd);
        document.addEventListener('touchmove', onSplitDragMove, {passive: false});
        document.addEventListener('touchend', onSplitDragEnd);
    };
    splitHandle.addEventListener('mousedown', onSplitDragStart);
    splitHandle.addEventListener('touchstart', onSplitDragStart, {passive: true});

    // Keep the view pinned to the bottom when the wrapper resizes (map/footer
    // toggling, window resize, multibinds appearing) — unless the user has
    // scrolled up into split view.
    let previousHeight = outputWrapper.clientHeight;
    const resizeObserver = new ResizeObserver(() => {
        const newHeight = outputWrapper.clientHeight;
        if (newHeight === previousHeight) return;
        const wasAtBottom =
            outputWrapper.scrollTop + previousHeight + splitBottom.clientHeight >= outputWrapper.scrollHeight - 1;
        previousHeight = newHeight;
        if (!isSplitViewState && wasAtBottom) {
            requestAnimationFrame(() => {
                outputWrapper.scrollTop = outputWrapper.scrollHeight;
            });
        }
    });
    resizeObserver.observe(outputWrapper);

    const handleMessage = (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => {
        const timestampValue = typeof timestamp === 'number' ? timestamp : Date.now();
        const node = buildMessageNode(message, type, timestampValue);
        if (!node) return;
        appendNode(node, () => buildMessageNode(message, type, timestampValue) as HTMLElement);
    };

    client.on('message', handleMessage);

    return {
        destroy() {
            client.off('message', handleMessage);
            outputWrapper.removeEventListener('scroll', checkSplitView);
            outputWrapper.removeEventListener('wheel', onWheel);
            splitHandle.removeEventListener('mousedown', onSplitDragStart);
            splitHandle.removeEventListener('touchstart', onSplitDragStart);
            document.removeEventListener('mousemove', onSplitDragMove);
            document.removeEventListener('mouseup', onSplitDragEnd);
            document.removeEventListener('touchmove', onSplitDragMove);
            document.removeEventListener('touchend', onSplitDragEnd);
            resizeObserver.disconnect();
            if (currentOutputWrapper === outputWrapper) {
                currentOutputWrapper = null;
            }
            if (currentStickyArea === stickyArea) {
                currentStickyArea = null;
            }
        },
        isSplitView: () => isSplitViewState,
        suppressSplitView: (durationMs: number) => {
            suppressSplitViewUntil = Date.now() + durationMs;
        },
        appendNode,
    };
}
