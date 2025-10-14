import appEventBus from "../events/app-event-bus";

export default function createIdleTimer(timeout = 120000) {
    let lastActivity = Date.now();

    const reset = () => {
        lastActivity = Date.now();
    };

    const isIdle = () => Date.now() - lastActivity >= timeout;

    reset();
    appEventBus.on('command', reset);

    return {
        isIdle,
        reset,
    };
}

