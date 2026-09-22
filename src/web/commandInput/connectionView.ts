/**
 * What the command line needs to know about the connection, published by main.ts
 * (which owns the connect / login state machine) and read by <CommandLine>.
 *
 * `offline` = no socket, not connecting, and the login screen was dismissed: the
 * command line then shows the closed connection and a "Połącz ponownie" button.
 */
export interface ConnectionView {
  offline: boolean;
  /** When the command line went offline (ms epoch); null while online. */
  offlineSince: number | null;
}

let view: ConnectionView = { offline: false, offlineSince: null };
let reconnect: () => void = () => {};
const listeners = new Set<() => void>();

export function setConnectionOffline(offline: boolean): void {
  if (offline === view.offline) return;
  view = { offline, offlineSince: offline ? Date.now() : null };
  listeners.forEach((listener) => listener());
}

export function getConnectionView(): ConnectionView {
  return view;
}

export function subscribeConnectionView(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** main.ts hands over its connect action; the reconnect button calls it. */
export function setReconnectHandler(handler: () => void): void {
  reconnect = handler;
}

export function requestReconnect(): void {
  reconnect();
}
