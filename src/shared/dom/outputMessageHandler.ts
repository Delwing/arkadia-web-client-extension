import {AnsiAwareBuffer} from "@client/ansi/FormatState";
import {createSplitViewController} from "./splitViewController";

export type MessageHandlerClient = {
    on(event: 'message', listener: (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void): void;
    off(event: 'message', listener: (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void): void;
};

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
    // Fired when the user finishes dragging the split-view resize handle, with
    // the committed height in px (the page stores it as the preferred height).
    onSplitViewResize?: (heightPx: number) => void;
};

export type OutputMessageHandler = {
    destroy(): void;
    isSplitView(): boolean;
    // Suppresses split-view (re)detection for the given duration. Exposed so a
    // host can debounce its own layout churn (stock suppresses across
    // multibinds show/hide) without reaching into the engine's internals.
    suppressSplitView(durationMs: number): void;
    // Closes the split view on purpose (double-click, the pane's close button)
    // and pins the output to the bottom. Unlike just scrolling down, this works
    // while output is pouring in, when the scroll it causes would be ignored.
    closeSplitView(): void;
    // Shows a client message as if it had just been emitted: for messages that
    // arrived before the handler was set up (the page's output area renders
    // after the client starts).
    appendMessage(message?: string | AnsiAwareBuffer, type?: string, timestamp?: number): void;
    // Appends an arbitrary node through the same insert/trim/scroll/sticky-mirror
    // pipeline as an incoming client message. `rebuild` — when provided — must
    // return a fresh, independently-live equivalent node; it is called again
    // (never cloned) to populate the sticky-view mirror, so per-node listeners
    // (hyperlinks, click handlers) stay intact there too. Omit it for transient
    // chrome that should not be mirrored (e.g. a connect prompt).
    appendNode(node: HTMLElement, rebuild?: () => HTMLElement): void;
};

/**
 * The output's lines sit in blocks of OUTPUT_BLOCK_LINES, not straight in the
 * wrapper. A full block is sealed, and CSS contains a sealed block (`contain:
 * content`), so each frame lays out and paints the newest block instead of the
 * whole scrollback: about half the browser's rendering work while text streams
 * in, with the default 5000-line buffer (docs/dev/PERFORMANCE.md).
 *
 * Code that walks the lines goes through {@link outputLines},
 * {@link outputLinesFromEnd} and {@link isOutputLine}, never the wrapper's
 * children.
 */
export const OUTPUT_BLOCK_CLASS = 'output-block';
export const OUTPUT_BLOCK_SEALED_CLASS = 'output-block-sealed';
const OUTPUT_BLOCK_LINES = 100;

/** The output's lines (and anything else in it, such as the toast strip), top to bottom. */
export function outputLines(wrapper: Element): Element[] {
    const lines: Element[] = [];
    for (let el = wrapper.firstElementChild; el; el = el.nextElementSibling) {
        if (el.classList.contains(OUTPUT_BLOCK_CLASS)) {
            for (let line = el.firstElementChild; line; line = line.nextElementSibling) lines.push(line);
        } else {
            lines.push(el);
        }
    }
    return lines;
}

/** The output's lines from the newest back, without listing them all first. */
export function* outputLinesFromEnd(wrapper: Element): Generator<Element> {
    for (let el = wrapper.lastElementChild; el; el = el.previousElementSibling) {
        if (el.classList.contains(OUTPUT_BLOCK_CLASS)) {
            for (let line = el.lastElementChild; line; line = line.previousElementSibling) yield line;
        } else {
            yield el;
        }
    }
}

/** Whether `line` is (still) one of the wrapper's lines: not trimmed, not inside a line. */
export function isOutputLine(wrapper: Element, line: Element): boolean {
    const parent = line.parentElement;
    if (parent === wrapper) return !line.classList.contains(OUTPUT_BLOCK_CLASS);
    return !!parent && parent.classList.contains(OUTPUT_BLOCK_CLASS) && parent.parentElement === wrapper;
}

const TIMESTAMP_CLASS = 'output-show-timestamps';
const MESSAGE_TYPE_CLASS = 'output-show-message-types';

let timestampsVisible = false;
let messageTypesVisible = false;
let currentOutputWrapper: HTMLElement | null = null;
let currentStickyArea: HTMLElement | null = null;

// Same fields as Date#toLocaleString(), but built once: toLocaleString creates a new
// formatter per call, and this runs for every output line.
const TIMESTAMP_TITLE_FORMAT = new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
});

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
    if (timestampsVisible) fillLineChrome();
}

function applyMessageTypeVisibility() {
    if (currentOutputWrapper) {
        currentOutputWrapper.classList.toggle(MESSAGE_TYPE_CLASS, messageTypesVisible);
    }
    if (currentStickyArea) {
        currentStickyArea.classList.toggle(MESSAGE_TYPE_CLASS, messageTypesVisible);
    }
    if (messageTypesVisible) fillLineChrome();
}

/**
 * The stock wrapper builds its timestamp and message-type spans only while their
 * toggle is on: hidden, they were a quarter of the output's DOM nodes, laid out and
 * styled on every frame for nothing. Turning a toggle on gives the lines already
 * on screen the spans they were built without.
 */
function fillLineChrome() {
    for (const container of [currentOutputWrapper, currentStickyArea]) {
        if (!container) continue;
        for (const wrapper of container.querySelectorAll<HTMLElement>('.output_msg')) {
            addLineChrome(wrapper);
        }
    }
}

function addLineChrome(wrapper: HTMLElement) {
    const text = wrapper.querySelector(':scope > .output_msg_text');
    const content = text?.querySelector(':scope > .output_msg_content');
    if (!text || !content) return;
    if (timestampsVisible && !text.querySelector(':scope > .output-timestamp')) {
        text.insertBefore(createTimestampElement(Number(wrapper.dataset.timestamp)), text.firstChild);
    }
    if (messageTypesVisible && !text.querySelector(':scope > .output-message-type')) {
        text.insertBefore(createMessageTypeElement(wrapper.dataset.messageType), content);
    }
}

// The `.output-timestamp` / `.output-message-type` spans the toggle classes
// (`output-show-*`) key off — one source of truth for the class names, time
// formatting, and hover tooltips.
export function createTimestampElement(timestamp: number): HTMLSpanElement {
    const timestampEl = document.createElement('span');
    timestampEl.classList.add('output-timestamp');
    timestampEl.textContent = formatTimestamp(timestamp);
    timestampEl.dataset.timestamp = `${timestamp}`;
    timestampEl.title = TIMESTAMP_TITLE_FORMAT.format(timestamp);
    return timestampEl;
}

export function createMessageTypeElement(type: string | undefined): HTMLSpanElement {
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

// A decorated message block (inventory, body loot, character description) marks
// itself with `AnsiAwareBuffer.flair`, which becomes a class pair the
// stylesheets (messageFlair.css) style.
const FLAIR_NAME = /^[a-z][a-z0-9-]*$/;

export function applyFlairClass(element: HTMLElement, message: string | AnsiAwareBuffer | undefined): void {
    if (!(message instanceof AnsiAwareBuffer)) return;
    const flair = message.flair;
    // Guard the class name: it comes from a script, and a stray space or dot
    // would throw out of classList.add and take the whole message with it.
    if (!flair || !FLAIR_NAME.test(flair)) return;
    element.classList.add('msg-flair', `msg-flair-${flair}`);
}

// One message's `.output_msg` wrapper: timestamp + type spans plus the content.
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
    applyFlairClass(wrapper, message);

    const messageDiv = document.createElement('div');
    messageDiv.classList.add('output_msg_text');
    wrapper.dataset.timestamp = `${timestamp}`;
    // Kept so the type span can be added later (see fillLineChrome).
    if (type !== undefined) wrapper.dataset.messageType = type;

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

    if (timestampsVisible) messageDiv.appendChild(createTimestampElement(timestamp));
    if (messageTypesVisible) messageDiv.appendChild(createMessageTypeElement(type));
    messageDiv.appendChild(contentSpan);
    wrapper.appendChild(messageDiv);

    return wrapper;
}

const buildMessageNode = (message: string | AnsiAwareBuffer | undefined, type: string | undefined, timestamp: number): HTMLElement | null => {
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
        onSplitViewResize,
    }: OutputHandlerOptions,
): OutputMessageHandler {
    currentOutputWrapper = outputWrapper;
    currentStickyArea = stickyArea;
    applyTimestampVisibility();
    applyMessageTypeVisibility();

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

    // Split view is off (pinned to bottom) until the user scrolls up. While on,
    // trimming and auto-scroll pause so the scrollback the user is reading stays
    // put. The scroll/wheel/resize/drag state machine behind that lives in the
    // shared controller — what stays here is what only this host knows: the
    // sticky mirror and the trim.
    // The pane lies over the last lines instead of being added below them, so
    // showing and hiding it never changes the scroll height. When it did, a
    // smooth scroll still under way kept heading for the old, taller bottom
    // and Chrome drew a frame or two of shifted, doubled lines as the pane
    // closed. At the very bottom it covers the newest lines with its own copy
    // of them, so closing there changes nothing on screen.
    const overlayPane = () => {
        splitBottom.style.marginTop = `${-splitBottom.offsetHeight}px`;
    };
    // Its height also follows the window (max-height: 50vh)
    const paneResize = new ResizeObserver(overlayPane);
    paneResize.observe(splitBottom);

    const splitView = createSplitViewController({
        scrollEl: outputWrapper,
        // Covered lines are not seen lines any more: only the real bottom counts
        getSplitHeight: () => 0,
        onOpen: () => {
            splitBottom.classList.remove('split-hidden');
            overlayPane();
            refreshStickyArea();
        },
        onClose: () => {
            splitBottom.classList.add('split-hidden');
            overlayPane();
            stickyArea.replaceChildren();
        },
        onHandleDrag: (heightPx) => {
            splitBottom.style.height = `${heightPx}px`;
            overlayPane();
        },
        onHandleDragEnd: () => {
            refreshStickyArea();
            // Measured here: getSplitHeight no longer reports the pane's height.
            // The CSS max-height may have clamped what was dragged.
            onSplitViewResize?.(splitBottom.offsetHeight);
        },
    });
    const detachHandle = splitView.attachHandle(splitHandle);

    // Fixtures of the wrapper (the split pane, anything marked data-output-keep
    // such as the toast strip) are never trimmed and do not count as lines.
    const isFixture = (el: Element) => el === splitBottom || el.hasAttribute('data-output-keep');

    // Lines go into blocks of OUTPUT_BLOCK_LINES (see OUTPUT_BLOCK_CLASS). Only
    // the open block, the newest, takes new lines; the others are sealed.
    let openBlock: HTMLElement | null = null;
    let openBlockLines = 0;

    const blockFor = (): HTMLElement => {
        // Still last before the pane: something put straight into the wrapper
        // after the block would otherwise end up below lines that came later.
        if (openBlock && openBlockLines < OUTPUT_BLOCK_LINES && openBlock.parentNode === outputWrapper
            && openBlock.nextElementSibling === splitBottom) {
            return openBlock;
        }
        openBlock?.classList.add(OUTPUT_BLOCK_SEALED_CLASS);
        openBlock = document.createElement('div');
        openBlock.className = OUTPUT_BLOCK_CLASS;
        // Keep splitBottom last: insert output before it, never after.
        outputWrapper.insertBefore(openBlock, splitBottom);
        openBlockLines = 0;
        return openBlock;
    };

    // Exact count of the lines, in blocks or (from before the handler, or put
    // there by someone else) straight in the wrapper. A walk over the wrapper's
    // children: a few dozen blocks, not thousands of lines.
    const countLines = (): number => {
        let lines = 0;
        for (let el = outputWrapper.firstElementChild; el; el = el.nextElementSibling) {
            if (isFixture(el)) continue;
            lines += el.classList.contains(OUTPUT_BLOCK_CLASS) ? el.childElementCount : 1;
        }
        return lines;
    };

    // The lines, as last counted plus one per append since. The exact count is
    // only taken when this estimate says the trim threshold may be crossed;
    // anything else adding or removing lines only skews it until that recount.
    let estimatedLines = countLines();

    // Removes the `excess` oldest lines: whole blocks while a block is all
    // excess, then single lines from the front of the next one.
    const trimOldest = (excess: number) => {
        let el = outputWrapper.firstElementChild;
        while (excess > 0 && el) {
            const next = el.nextElementSibling;
            if (isFixture(el)) {
                // stays
            } else if (!el.classList.contains(OUTPUT_BLOCK_CLASS)) {
                outputWrapper.removeChild(el);
                excess--;
            } else if (el.childElementCount <= excess && el !== openBlock) {
                excess -= el.childElementCount;
                outputWrapper.removeChild(el);
            } else {
                while (excess > 0 && el.firstElementChild) {
                    el.removeChild(el.firstElementChild);
                    excess--;
                }
                if (el !== openBlock && !el.firstElementChild) outputWrapper.removeChild(el);
            }
            el = next;
        }
    };

    const appendNode = (node: HTMLElement, rebuild?: () => HTMLElement) => {
        blockFor().appendChild(node);
        openBlockLines++;
        estimatedLines++;

        if (rebuild) {
            recent.push(rebuild);
            while (recent.length > stickyLines) recent.shift();
        }

        const maxElementsValue = typeof maxElements === 'function' ? maxElements() : maxElements;

        // Trim in batches, and only while the user is not scrolled up into split
        // view — otherwise removing the oldest nodes would shift the content
        // they are reading. When split view closes, the accumulated excess
        // drains on the next message via the `> maxElements + trimSlack` check.
        if (!splitView.isSplitView() && estimatedLines > maxElementsValue + trimSlack) {
            estimatedLines = countLines();
            if (estimatedLines > maxElementsValue + trimSlack) {
                trimOldest(estimatedLines - maxElementsValue);
                estimatedLines = countLines();
            }
        }

        if (splitView.isSplitView()) {
            if (rebuild) {
                stickyArea.appendChild(rebuild());
                while (stickyArea.childElementCount > stickyLines && stickyArea.firstElementChild) {
                    stickyArea.removeChild(stickyArea.firstElementChild);
                }
            }
        } else {
            // Pinning also suppresses split-view checks for a moment, so the
            // view doesn't blink while text is streaming in.
            splitView.pinToBottom();
        }
    };

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
            detachHandle();
            splitView.destroy();
            paneResize.disconnect();
            if (currentOutputWrapper === outputWrapper) {
                currentOutputWrapper = null;
            }
            if (currentStickyArea === stickyArea) {
                currentStickyArea = null;
            }
        },
        isSplitView: () => splitView.isSplitView(),
        suppressSplitView: (durationMs: number) => {
            splitView.suppress(durationMs);
        },
        closeSplitView: () => {
            splitView.close();
            splitView.pinToBottom(true);
        },
        appendMessage: handleMessage,
        appendNode,
    };
}
