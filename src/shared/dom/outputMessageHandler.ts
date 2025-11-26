import {AnsiAwareBuffer} from "@client/ansi/FormatState";

type MessageHandlerClient = {
    on(event: 'message', listener: (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void): void;
    off(event: 'message', listener: (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => void): void;
};

type OutputHandlerOptions = {
    outputWrapper: HTMLElement;
    splitBottom: HTMLElement;
    stickyArea: HTMLElement;
    isSplitView: () => boolean;
    stickyLines: number;
    maxElements?: number;
    suppressSplitView?: (durationMs: number) => void;
};

const TIMESTAMP_CLASS = 'output-show-timestamps';

let timestampsVisible = false;
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

function createTimestampElement(timestamp: number): HTMLSpanElement {
    const timestampEl = document.createElement('span');
    timestampEl.classList.add('output-timestamp');
    timestampEl.textContent = formatTimestamp(timestamp);
    timestampEl.dataset.timestamp = `${timestamp}`;
    timestampEl.title = new Date(timestamp).toLocaleString();
    return timestampEl;
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
    messageDiv.appendChild(contentSpan);
    wrapper.appendChild(messageDiv);

    return wrapper;
}

export function setupOutputMessageHandler(
    client: MessageHandlerClient,
    {
        outputWrapper,
        splitBottom,
        stickyArea,
        isSplitView,
        stickyLines,
        maxElements = 1000,
        suppressSplitView,
    }: OutputHandlerOptions,
) {
    currentOutputWrapper = outputWrapper;
    currentStickyArea = stickyArea;
    applyTimestampVisibility();

    const handleMessage = (message?: string | AnsiAwareBuffer, type?: string, timestamp?: number) => {
        // Allow empty strings to render as empty lines, but skip undefined/null
        if (message === undefined || message === null) {
            return;
        }

        const timestampValue = typeof timestamp === 'number' ? timestamp : Date.now();
        const wrapper = createMessageWrapper(message, type, timestampValue);

        outputWrapper.insertBefore(wrapper, splitBottom);

        while (outputWrapper.childElementCount - 1 > maxElements) {
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

        if (isSplitView()) {
            // Create a fresh wrapper with new event listeners for sticky area
            const stickyWrapper = createMessageWrapper(message, type, timestampValue);
            stickyArea.appendChild(stickyWrapper);
            while (stickyArea.childElementCount > stickyLines) {
                const firstSticky = stickyArea.firstElementChild;
                if (firstSticky) {
                    stickyArea.removeChild(firstSticky);
                } else {
                    break;
                }
            }
        } else {
            // Suppress split view checks to prevent blinking when text is being output
            if (suppressSplitView) {
                suppressSplitView(250);
            }
            // Defer scroll to next frame to allow layout changes (e.g., multibinds) to settle first
            requestAnimationFrame(() => {
                outputWrapper.scrollTop = outputWrapper.scrollHeight;
            });
        }
    };

    client.on('message', handleMessage);

    return () => {
        client.off('message', handleMessage);
        if (currentOutputWrapper === outputWrapper) {
            currentOutputWrapper = null;
        }
        if (currentStickyArea === stickyArea) {
            currentStickyArea = null;
        }
    };
}
