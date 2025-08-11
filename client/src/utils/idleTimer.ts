import Client from "../Client";

export default function createIdleTimer(client: Client, timeout = 120000) {
    let lastActivity = Date.now();

    const reset = () => {
        lastActivity = Date.now();
    };

    const isIdle = () => Date.now() - lastActivity >= timeout;

    reset();
    client.addEventListener('command', reset);

    return {
        isIdle,
        reset,
    };
}

