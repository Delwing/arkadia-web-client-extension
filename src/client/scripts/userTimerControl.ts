/**
 * How a "start / stop timer" action reaches the running timers. Its own module
 * so the actions (userTriggers) and the timers (userTimers, which runs those
 * actions) do not import each other.
 */
export type TimerControl = "start" | "stop";

let handler: ((id: string, control: TimerControl) => void) | null = null;

export function setTimerControlHandler(next: ((id: string, control: TimerControl) => void) | null): void {
    handler = next;
}

export function controlUserTimer(id: string, control: TimerControl): void {
    handler?.(id, control);
}
