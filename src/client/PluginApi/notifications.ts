import type { PluginApiContext } from "./context";

/** A button on a toast. */
export interface NotificationButton {
  label: string;
  /** Sent like a typed command when clicked. */
  command?: string;
  onClick?: () => void;
  /** Drawn as the main button. */
  primary?: boolean;
  /** Leave the toast up after the click. */
  keepOpen?: boolean;
}

export interface NotificationOptions {
  text: string;
  /** Bold first line; `text` then reads as the body under it. */
  title?: string;
  /** Defaults to 'info'. Warnings and errors still show under "do not disturb". */
  level?: 'info' | 'success' | 'warning' | 'error';
  /** Milliseconds on screen (scaled by the player's setting). */
  time?: number;
  /** Stays until closed or dismissed. */
  sticky?: boolean;
  /** A progress bar, e.g. `{ value: 3, max: 10 }`. */
  progress?: { value: number; max: number };
  actions?: NotificationButton[];
  /** Also fire an OS/browser notification (when the user granted permission). */
  system?: boolean;
}

export interface NotificationHandle {
  /** Change the toast in place; if the player already closed it, nothing shows. */
  update(patch: Partial<NotificationOptions>): void;
  /** Show it again as a repeat (counts ×2, ×3…) and restart its timer. */
  repeat(patch?: Partial<NotificationOptions>): void;
  dismiss(): void;
}

/**
 * Notifications API - toasts over the game output. The player can mute all
 * plugin toasts in the settings.
 */
export interface NotificationsApi {
  /**
   * Show a toast.
   *
   * @example
   * ```typescript
   * api.notifications.show("Zapisano");
   *
   * const task = api.notifications.show({
   *   title: "Liczę zioła",
   *   text: "0 z 12",
   *   sticky: true,
   *   progress: { value: 0, max: 12 },
   *   actions: [{ label: "Przerwij", command: "/stop-ziola" }],
   * });
   * task.update({ text: "5 z 12", progress: { value: 5, max: 12 } });
   * task.dismiss();
   * ```
   */
  show(options: NotificationOptions | string): NotificationHandle;
}

export function createNotificationsApi(ctx: PluginApiContext): NotificationsApi {
  // Keys of this plugin's toasts, closed when it unloads.
  const notificationKeys = new Set<string>();
  let notificationSeq = 0;
  // A sticky toast from an unloaded plugin would have nobody to close it.
  ctx.onCleanup(() => {
    for (const key of notificationKeys) ctx.client.sendEvent('notify.dismiss', { key });
    notificationKeys.clear();
  });
  return {
    show: (options) => {
      const key = `plugin:${ctx.pluginId}:${++notificationSeq}`;
      let current: NotificationOptions = typeof options === 'string' ? { text: options } : { ...options };
      const send = (update: boolean) => {
        notificationKeys.add(key);
        ctx.client.sendEvent('notify', {
          ...current,
          key,
          update,
          source: 'plugin',
        });
      };
      send(false);
      return {
        update: (patch) => {
          current = { ...current, ...patch };
          send(true);
        },
        repeat: (patch) => {
          current = { ...current, ...patch };
          send(false);
        },
        dismiss: () => {
          notificationKeys.delete(key);
          ctx.client.sendEvent('notify.dismiss', { key });
        },
      };
    },
  };
}
