import type { NotificationAction, NotificationIcon, NotificationLevel, NotificationPayload, NotificationSource } from '@shared/events/clientEvents.ts';
import { URGENT_LEVELS, type ToastSettings } from './toastSettings';

export interface Toast {
    id: number;
    key?: string;
    text: string;
    title?: string;
    level: NotificationLevel;
    icon?: NotificationIcon;
    source?: NotificationSource;
    /** How many times it was raised under its key. */
    count: number;
    /** Sticky by its owner, or pinned by the player. */
    sticky: boolean;
    progress?: { value: number; max: number };
    actions: NotificationAction[];
    /** Full lifetime in ms, settings scale applied. */
    duration: number;
    /** Lifetime left while the timer is stopped. */
    remaining: number;
    /** When it expires while the timer runs; null while stopped. */
    deadline: number | null;
    createdAt: number;
}

export interface ToastSnapshot {
    /** Newest first. */
    toasts: Toast[];
    /** Only the newest `maxVisible` show unless expanded. */
    expanded: boolean;
}

/** Plain one-liners go quickly; a toast with a title or buttons needs reading time. */
const SHORT_MS = 3000;
const RICH_MS = 7000;
/** Kept even when hidden behind "+N", so a burst can't grow without bound. */
const MAX_TOASTS = 30;

export function urgent(level: NotificationLevel) {
    return URGENT_LEVELS.includes(level);
}

/**
 * The toasts on screen and their timers. Framework-free so it can be driven
 * from the event bus and tested without a DOM; the React stack only renders it.
 *
 * A timer runs only while its toast is visible and the pointer is not over the
 * stack, so nothing expires behind the "+N" pill or under the cursor.
 */
export class ToastStore {
    private toasts: Toast[] = [];
    private expanded = false;
    private paused = false;
    private nextId = 1;
    private timers = new Map<number, ReturnType<typeof setTimeout>>();
    /** Whether the owner asked for sticky, as opposed to the player pinning it. */
    private ownerSticky = new Map<number, boolean>();
    private listeners = new Set<() => void>();
    private snapshot: ToastSnapshot = { toasts: [], expanded: false };

    constructor(
        private readonly settings: () => ToastSettings,
        private readonly now: () => number = () => Date.now(),
    ) {}

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    };

    getSnapshot = () => this.snapshot;

    /** Shows (or merges) a notification; returns false when settings hide it. */
    show(payload: NotificationPayload): boolean {
        const s = this.settings();
        const level = payload.level ?? 'info';
        const existing = payload.key !== undefined ? this.toasts.find(t => t.key === payload.key) : undefined;

        if (!existing) {
            if (payload.source && s.toastMutedSources.includes(payload.source)) return false;
            if (s.toastDoNotDisturb && !urgent(level)) return false;
            // An update for a toast already closed stays closed: the player
            // dismissed it, a step of the same walk must not bring it back.
            if (payload.update) return false;
        }

        const rich = !!payload.title || !!payload.actions?.length;
        const duration = Math.round((payload.time ?? (rich ? RICH_MS : SHORT_MS)) * s.toastDurationScale);
        const fields = {
            text: payload.text,
            title: payload.title,
            level,
            icon: payload.icon,
            source: payload.source,
            progress: payload.progress,
            actions: payload.actions ?? [],
        };

        if (existing) {
            const pinned = existing.sticky && !this.wasStickyByOwner(existing);
            Object.assign(existing, fields);
            existing.sticky = !!payload.sticky || pinned;
            if (!payload.update) {
                existing.count += 1;
                this.restartTimer(existing, duration);
                // A repeat is news again: bring it to the front.
                this.toasts = [existing, ...this.toasts.filter(t => t !== existing)];
            } else if (!existing.sticky && existing.duration === 0) {
                // Owner let go of a sticky toast: from now on it times out.
                this.restartTimer(existing, duration);
            }
            this.ownerSticky.set(existing.id, !!payload.sticky);
        } else {
            const toast: Toast = {
                id: this.nextId++,
                key: payload.key,
                ...fields,
                count: 1,
                sticky: !!payload.sticky,
                duration: payload.sticky ? 0 : duration,
                remaining: payload.sticky ? 0 : duration,
                deadline: null,
                createdAt: this.now(),
            };
            this.ownerSticky.set(toast.id, !!payload.sticky);
            this.toasts = [toast, ...this.toasts];
            this.trim();
        }
        this.sync();
        return true;
    }

    dismiss(id: number) {
        const before = this.toasts.length;
        this.toasts = this.toasts.filter(t => t.id !== id);
        if (this.toasts.length === before) return;
        this.clearTimer(id);
        this.ownerSticky.delete(id);
        if (this.toasts.length <= this.settings().toastMaxVisible) this.expanded = false;
        // The stack unmounts when empty, so the pointer never "leaves" it.
        if (this.toasts.length === 0) this.paused = false;
        this.sync();
    }

    dismissKey(key: string) {
        const toast = this.toasts.find(t => t.key === key);
        if (toast) this.dismiss(toast.id);
    }

    dismissAll() {
        for (const t of [...this.toasts]) this.dismiss(t.id);
    }

    /** Keeps a toast until it is closed by hand. */
    pin(id: number) {
        const toast = this.toasts.find(t => t.id === id);
        if (!toast || toast.sticky) return;
        toast.sticky = true;
        this.clearTimer(id);
        toast.deadline = null;
        this.sync();
    }

    /** The pointer is over the stack: hold every timer where it is. */
    setPaused(paused: boolean) {
        if (this.paused === paused) return;
        this.paused = paused;
        this.sync();
    }

    setExpanded(expanded: boolean) {
        if (this.expanded === expanded) return;
        this.expanded = expanded;
        this.sync();
    }

    /** Re-applies settings that change what is visible (max count, mutes). */
    refresh() {
        const s = this.settings();
        const hidden = this.toasts.filter(t => !this.ownerSticky.get(t.id) && t.source && s.toastMutedSources.includes(t.source));
        for (const t of hidden) this.dismiss(t.id);
        this.sync();
    }

    private wasStickyByOwner(toast: Toast) {
        return this.ownerSticky.get(toast.id) ?? false;
    }

    private restartTimer(toast: Toast, duration: number) {
        this.clearTimer(toast.id);
        toast.deadline = null;
        toast.duration = toast.sticky ? 0 : duration;
        toast.remaining = toast.duration;
    }

    private trim() {
        while (this.toasts.length > MAX_TOASTS) {
            const victim = [...this.toasts].reverse().find(t => !t.sticky) ?? this.toasts[this.toasts.length - 1];
            this.toasts = this.toasts.filter(t => t !== victim);
            this.clearTimer(victim.id);
            this.ownerSticky.delete(victim.id);
        }
    }

    private visibleIds(): Set<number> {
        const shown = this.expanded ? this.toasts : this.toasts.slice(0, this.settings().toastMaxVisible);
        return new Set(shown.map(t => t.id));
    }

    /** Starts and stops timers to match visibility and hover, then publishes. */
    private sync() {
        const visible = this.visibleIds();
        const now = this.now();
        for (const toast of this.toasts) {
            const run = !toast.sticky && !this.paused && visible.has(toast.id);
            if (run && toast.deadline === null) {
                toast.deadline = now + toast.remaining;
                const id = toast.id;
                this.timers.set(id, setTimeout(() => this.dismiss(id), toast.remaining));
            } else if (!run && toast.deadline !== null) {
                toast.remaining = Math.max(0, toast.deadline - now);
                toast.deadline = null;
                this.clearTimer(toast.id);
            }
        }
        this.snapshot = { toasts: this.toasts.map(t => ({ ...t })), expanded: this.expanded };
        this.listeners.forEach(l => l());
    }

    private clearTimer(id: number) {
        const timer = this.timers.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            this.timers.delete(id);
        }
    }
}
