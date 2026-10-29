import { useSyncExternalStore } from "react";
import eventBus from "@modules/core/eventBus";

// Held outside the component: the icon remounts whenever the map moves between
// its default spot and a layout panel, and the pauser does not announce itself again.
let paused = false;
const listeners = new Set<() => void>();
const setPaused = (next: boolean) => {
    if (next === paused) return;
    paused = next;
    for (const listener of [...listeners]) listener();
};
eventBus.on("pauserStart", () => setPaused(true));
eventBus.on("pauserEnd", () => setPaused(false));
const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
};

export const PauseIcon = () => {
    const visible = useSyncExternalStore(subscribe, () => paused);

    if (!visible) {
        return null;
    }

    return <>⏸</>;
};
