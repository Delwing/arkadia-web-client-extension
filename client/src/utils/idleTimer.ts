import Client from "../Client";

export default function createIdleTimer(client: Client, timeout = 120000) {
    let idle = false;
    let timer: number | undefined;

    const reset = () => {
        idle = false;
        if (timer !== undefined) {
            window.clearTimeout(timer);
        }
        timer = window.setTimeout(() => {
            idle = true;
        }, timeout);
    };

    reset();
    client.addEventListener('command', reset);

    return {
        isIdle: () => idle,
        reset,
    };
}

