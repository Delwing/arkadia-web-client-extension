type MessageHandlerClient = {
    on(event: 'message', listener: (message?: string, type?: string, timestamp?: number) => void): void;
    off(event: 'message', listener: (message?: string, type?: string, timestamp?: number) => void): void;
};

type OutputHandlerOptions = {
    outputWrapper: HTMLElement;
    splitBottom: HTMLElement;
    stickyArea: HTMLElement;
    isSplitView: () => boolean;
    processSticky: (count: number) => void;
    stickyLines: number;
    maxElements?: number;
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

export function setupOutputMessageHandler(
    client: MessageHandlerClient,
    {
        outputWrapper,
        splitBottom,
        stickyArea,
        isSplitView,
        processSticky,
        stickyLines,
        maxElements = 1000,
    }: OutputHandlerOptions,
) {
    currentOutputWrapper = outputWrapper;
    currentStickyArea = stickyArea;
    applyTimestampVisibility();

    const handleMessage = (message?: string, type?: string, timestamp?: number) => {
        if (!message || message === "") {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.classList.add('output_msg');

        if (type) {
            wrapper.classList.add(type);
        }

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('output_msg_text');

        const timestampValue = typeof timestamp === 'number' ? timestamp : Date.now();
        wrapper.dataset.timestamp = `${timestampValue}`;
        const timestampEl = createTimestampElement(timestampValue);
        const contentSpan = document.createElement('span');
        contentSpan.classList.add('output_msg_content');
        contentSpan.innerHTML = message;
        contentSpan.style.whiteSpace = 'pre-wrap';

        messageDiv.appendChild(timestampEl);
        messageDiv.appendChild(contentSpan);

        wrapper.appendChild(messageDiv);
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
            stickyArea.appendChild(wrapper.cloneNode(true));
            processSticky(1);
            while (stickyArea.childElementCount > stickyLines) {
                const firstSticky = stickyArea.firstElementChild;
                if (firstSticky) {
                    stickyArea.removeChild(firstSticky);
                } else {
                    break;
                }
            }
        } else {
            outputWrapper.scrollTop = outputWrapper.scrollHeight;
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
