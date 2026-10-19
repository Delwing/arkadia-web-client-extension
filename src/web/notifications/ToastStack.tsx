import { useEffect, useState, useSyncExternalStore } from 'react';
import { Check, CircleX, Copy, Info, Moon, Pin, Sun, TriangleAlert, X } from 'lucide-react';
import type { NotificationAction, NotificationIcon, NotificationLevel } from '@shared/events/clientEvents.ts';
import { getShellSettings, onShellSettingsChange } from '@modules/core/settings';
import type { Toast, ToastStore } from './toastStore';
import { normalizeToastSettings } from './toastSettings';

const LEVEL_ICONS: Record<NotificationLevel, typeof Info> = {
    info: Info,
    success: Check,
    warning: TriangleAlert,
    error: CircleX,
};

const ICONS: Record<NotificationIcon, typeof Info> = {
    sun: Sun,
    moon: Moon,
};

function formatAge(ms: number) {
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) return `${minutes} min temu`;
    return `${Math.floor(minutes / 60)} h temu`;
}

function useToastSettings() {
    const [settings, setSettings] = useState(() => normalizeToastSettings(getShellSettings()));
    useEffect(() => onShellSettingsChange((shell) => setSettings(normalizeToastSettings(shell))), []);
    return settings;
}

/** Re-renders every half minute while something shows an age. */
function useMinuteTick(active: boolean) {
    const [, setTick] = useState(0);
    useEffect(() => {
        if (!active) return;
        const id = setInterval(() => setTick(t => t + 1), 30_000);
        return () => clearInterval(id);
    }, [active]);
}

function TimerBar({ toast }: { toast: Toast }) {
    if (toast.duration <= 0) return null;
    const left = toast.deadline !== null ? Math.max(0, toast.deadline - Date.now()) : toast.remaining;
    const from = left / toast.duration;
    return (
        <div className="toast__timer">
            <div
                // A new run (after a pause or a repeat) restarts the animation
                // from wherever the stopped bar stood.
                key={toast.deadline ?? 'stopped'}
                className={toast.deadline !== null ? 'toast__timer-fill is-running' : 'toast__timer-fill'}
                style={{ ['--toast-from' as string]: from, animationDuration: `${left}ms`, transform: `scaleX(${from})` }}
            />
        </div>
    );
}

interface ToastCardProps {
    toast: Toast;
    store: ToastStore;
    runAction: (action: NotificationAction) => void;
}

function ToastCard({ toast, store, runAction }: ToastCardProps) {
    const Icon = toast.icon ? ICONS[toast.icon] : LEVEL_ICONS[toast.level];
    const rich = !!toast.title || toast.actions.length > 0 || !!toast.progress;
    // Only worth saying once a toast has been up a while (a pinned one, an unanswered conflict).
    const ageMs = Date.now() - toast.createdAt;
    const age = ageMs >= 60_000 ? formatAge(ageMs) : null;
    const copy = () => { void navigator.clipboard?.writeText(toast.title ? `${toast.title}\n${toast.text}` : toast.text).catch(() => {}); };
    const pct = toast.progress && toast.progress.max > 0
        ? Math.min(100, Math.max(0, (toast.progress.value / toast.progress.max) * 100))
        : 0;

    const tools = (
        <span className="toast__tools">
            <button type="button" className="toast__tool" title="Kopiuj tekst" onClick={copy}><Copy size={13} /></button>
            {!toast.sticky && (
                <button type="button" className="toast__tool" title="Przypnij" onClick={() => store.pin(toast.id)}><Pin size={13} /></button>
            )}
            <button type="button" className="toast__tool toast__close" title="Zamknij" onClick={() => store.dismiss(toast.id)}><X size={14} /></button>
        </span>
    );
    const count = toast.count > 1 && <span className="toast__count">×{toast.count}</span>;

    return (
        <div className={`toast toast--${toast.level}${toast.icon ? ` toast--${toast.icon}` : ''}${rich ? ' toast--rich' : ''}`} data-key={toast.key}>
            <div className="toast__main">
                <span className="toast__icon"><Icon size={rich ? 15 : 13} strokeWidth={2.4} /></span>
                {rich ? (
                    <div className="toast__body">
                        <div className="toast__head">
                            <span className={toast.title ? 'toast__title' : 'toast__text toast__text--lead'}>{toast.title || toast.text}</span>
                            {count}
                            {toast.sticky && <Pin size={12} className="toast__pinned" />}
                            {age && <span className="toast__age">{age}</span>}
                            <span className="toast__spacer" />
                            {tools}
                        </div>
                        {toast.title && toast.text && <div className="toast__text">{toast.text}</div>}
                        {toast.progress && (
                            <div className="toast__progress"><div className="toast__progress-fill" style={{ width: `${pct}%` }} /></div>
                        )}
                        {toast.actions.length > 0 && (
                            <div className="toast__actions">
                                {toast.actions.map((action, i) => (
                                    <button
                                        key={`${i}-${action.label}`}
                                        type="button"
                                        className={`popup-btn popup-btn--control popup-btn--sm${action.primary ? ' popup-btn--solid' : ''}`}
                                        onClick={() => {
                                            runAction(action);
                                            if (!action.keepOpen) store.dismiss(toast.id);
                                        }}
                                    >
                                        {action.label}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <>
                        <span className="toast__text toast__text--line">{toast.text}</span>
                        {count}
                        {toast.sticky && <Pin size={12} className="toast__pinned" />}
                        {tools}
                    </>
                )}
            </div>
            <TimerBar toast={toast} />
        </div>
    );
}

export interface ToastStackProps {
    store: ToastStore;
    runAction: (action: NotificationAction) => void;
}

export function ToastStack({ store, runAction }: ToastStackProps) {
    const { toasts, expanded } = useSyncExternalStore(store.subscribe, store.getSnapshot);
    const settings = useToastSettings();
    useEffect(() => { store.refresh(); }, [store, settings]);
    useMinuteTick(toasts.some(t => t.title || t.actions.length > 0 || t.progress));

    if (toasts.length === 0) return null;

    const bottom = settings.toastPosition.startsWith('bottom');
    const shown = expanded ? toasts : toasts.slice(0, settings.toastMaxVisible);
    const hidden = toasts.length - shown.length;
    // Newest sits at the edge the stack grows from.
    const ordered = bottom ? [...shown].reverse() : shown;

    const pill = (hidden > 0 || expanded) && (
        <div className="toast-stack__more">
            {expanded ? (
                <>
                    <button type="button" className="toast-pill" onClick={() => store.dismissAll()}>Zamknij wszystkie</button>
                    <button type="button" className="toast-pill" onClick={() => store.setExpanded(false)}>Zwiń</button>
                </>
            ) : (
                <button type="button" className="toast-pill" onClick={() => store.setExpanded(true)}>+{hidden} więcej</button>
            )}
        </div>
    );

    return (
        <div
            className={`toast-stack toast-stack--${settings.toastPosition}`}
            onMouseEnter={() => store.setPaused(true)}
            onMouseLeave={() => store.setPaused(false)}
        >
            {bottom && pill}
            {ordered.map(toast => <ToastCard key={toast.id} toast={toast} store={store} runAction={runAction} />)}
            {!bottom && pill}
        </div>
    );
}
