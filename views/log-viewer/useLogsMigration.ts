import { useEffect, useRef, useState } from "react";
import { legacyLogsPending, subscribeLogsMigration, type LogsMigrationProgress } from "@web/logsMigration";

/**
 * Where the move of old logs to the new store stands, for a viewer's notice:
 * the progress while a tab (this one or another) is moving them, `pending`
 * when the old store is still there but nobody has reported progress yet, and
 * null once there is nothing left to move.
 *
 * `onFinished` runs when a move this page watched completes, so the host can
 * list again and show the sessions that just arrived.
 */
export function useLogsMigration(onFinished: () => void): LogsMigrationProgress | "pending" | null {
    const [progress, setProgress] = useState<LogsMigrationProgress | null>(null);
    const [pending, setPending] = useState(false);
    const finished = useRef(onFinished);
    finished.current = onFinished;

    useEffect(() => {
        let cancelled = false;
        let running = false;
        void legacyLogsPending().then((value) => {
            if (!cancelled && !running) setPending(value);
        });
        const unsubscribe = subscribeLogsMigration((next) => {
            setProgress(next);
            if (next) {
                running = true;
            } else if (running) {
                running = false;
                setPending(false);
                finished.current();
            }
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, []);

    // Pending with no progress heard: the move may have ended between the
    // check and the subscription, or run somewhere that does not broadcast.
    // Look again now and then, so the notice cannot outlive the old store.
    useEffect(() => {
        if (!pending || progress) return;
        const timer = window.setInterval(() => {
            void legacyLogsPending().then((value) => {
                if (value) return;
                setPending(false);
                finished.current();
            });
        }, 3000);
        return () => window.clearInterval(timer);
    }, [pending, progress]);

    return progress ?? (pending ? "pending" : null);
}
