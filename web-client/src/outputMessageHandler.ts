type MessageHandlerClient = {
    on(event: string, listener: (message: string, type?: string) => void): void;
    off(event: string, listener: (message: string, type?: string) => void): void;
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
    const handleMessage = (message: string, type?: string) => {
        if (message === "") {
            return;
        }

        const wrapper = document.createElement('div');
        wrapper.classList.add('output_msg');

        if (type) {
            wrapper.classList.add(type);
        }

        const messageDiv = document.createElement('div');
        messageDiv.innerHTML = message;
        messageDiv.classList.add('output_msg_text');
        messageDiv.style.whiteSpace = 'pre-wrap';

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
    };
}
