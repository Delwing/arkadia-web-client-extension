import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { Pause, Play, Repeat, RotateCcw, SkipBack, Square, StepBack, StepForward, X } from "lucide-react";
import { useClientEvent } from "../../hooks";
import recordingManager from "@web/RecordingManager";
import eventBus from "@modules/core/eventBus";
import type { RecordedEvent } from "@shared/recorder/Recorder";

type PlaybackLoopState = {
    start: number | null;
    end: number | null;
    enabled: boolean;
};

const SPEEDS = [0.5, 1, 2, 4, 10];
const TIMELINE_SLICES = 36;

const pad = (n: number) => String(n).padStart(2, "0");
function clock(ms: number) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
const speedLabel = (speed: number) => `${String(speed).replace(".", ",")}×`;

/**
 * Floating player for a recording: a compact, roughly square card (the
 * design's full-width bar took too much of the game output). Draggable by its
 * header; the timeline shows activity, progress and the A–B loop band.
 */
export const PlaybackControls: React.FC = () => {
    const [visible, setVisible] = useState(false);
    const [paused, setPaused] = useState(true);
    const [name, setName] = useState("");
    const [index, setIndex] = useState(0);
    const [times, setTimes] = useState<number[]>([]);
    const [timer, setTimer] = useState("");
    const [loop, setLoop] = useState<PlaybackLoopState>({ start: null, end: null, enabled: false });
    const [speed, setSpeed] = useState(() => recordingManager.getPlaybackSpeed());
    const [lastEvent, setLastEvent] = useState("");

    const panelRef = useRef<HTMLDivElement>(null);
    const timerIntervalRef = useRef<number | null>(null);
    const dragPointerIdRef = useRef<number | null>(null);
    const dragOffsetXRef = useRef(0);
    const dragOffsetYRef = useRef(0);

    const clearTimerInterval = () => {
        if (timerIntervalRef.current !== null) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }
    };

    const readRecording = () => {
        const events = recordingManager.getRecordedMessages();
        const first = events.find(e => typeof e.timestamp === "number")?.timestamp ?? 0;
        let previous = first;
        setTimes(events.map(e => {
            if (typeof e.timestamp === "number") previous = e.timestamp;
            return previous - first;
        }));
        setName(recordingManager.getPlaybackName() ?? "");
        setSpeed(recordingManager.getPlaybackSpeed());
        setLoop(recordingManager.getLoopState());
        setLastEvent("");
    };

    useClientEvent("recording.loaded", () => {
        setVisible(true);
        setPaused(true);
        setIndex(0);
        readRecording();
    });

    useClientEvent("playback.start", () => {
        setVisible(true);
        setPaused(false);
        setIndex(0);
        readRecording();
    });

    useClientEvent("playback.stop", () => {
        setVisible(false);
        clearTimerInterval();
        setTimer("");
    });

    useClientEvent("playback.pause", () => {
        setPaused(true);
        clearTimerInterval();
        setTimer("");
    });

    useClientEvent("playback.resume", () => {
        setPaused(false);
    });

    useEffect(() => {
        return eventBus.on("playback.index", (current: number) => {
            setIndex(current);
        });
    }, []);

    useClientEvent("playback.speed", (newSpeed: number) => {
        setSpeed(newSpeed);
    });

    useClientEvent("playback.event", (event: RecordedEvent) => {
        setLastEvent(`${event.direction === "in" ? "←" : "→"} ${event.message}`);
    });

    useClientEvent("playback.loop.updated", (loopState: PlaybackLoopState) => {
        setLoop(loopState);
    });

    useClientEvent("playback.timer", (data: { delay: number; startTime: number }) => {
        clearTimerInterval();

        const updateTimer = () => {
            const remaining = Math.max(0, data.delay - (Date.now() - data.startTime));
            if (remaining <= 0) {
                setTimer("");
                clearTimerInterval();
            } else {
                setTimer(`${(remaining / 1000).toFixed(1)} s`);
            }
        };

        updateTimer();
        timerIntervalRef.current = setInterval(updateTimer, 100) as unknown as number;
    });

    useEffect(() => {
        return () => {
            clearTimerInterval();
        };
    }, []);

    const clampToViewport = useCallback((x: number, y: number) => {
        const panel = panelRef.current;
        if (!panel) return { x, y };
        const margin = 12;
        const maxX = Math.max(margin, window.innerWidth - panel.offsetWidth - margin);
        const maxY = Math.max(margin, window.innerHeight - panel.offsetHeight - margin);
        return {
            x: Math.min(Math.max(x, margin), maxX),
            y: Math.min(Math.max(y, margin), maxY),
        };
    }, []);

    const updatePosition = useCallback((x: number, y: number) => {
        const panel = panelRef.current;
        if (!panel) return;
        const { x: cx, y: cy } = clampToViewport(x, y);
        panel.style.left = `${cx}px`;
        panel.style.top = `${cy}px`;
        panel.style.right = "auto";
        panel.style.bottom = "auto";
    }, [clampToViewport]);

    const handleDragHandlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
        const panel = panelRef.current;
        if (!panel) return;
        const rect = panel.getBoundingClientRect();
        dragPointerIdRef.current = event.pointerId;
        dragOffsetXRef.current = event.clientX - rect.left;
        dragOffsetYRef.current = event.clientY - rect.top;
        event.currentTarget.setPointerCapture(event.pointerId);
        panel.classList.add("is-dragging");
        event.preventDefault();
    }, []);

    const handleDragHandlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (dragPointerIdRef.current === null || event.pointerId !== dragPointerIdRef.current) return;
        event.preventDefault();
        updatePosition(event.clientX - dragOffsetXRef.current, event.clientY - dragOffsetYRef.current);
    }, [updatePosition]);

    const handleDragHandlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
        if (dragPointerIdRef.current === null || event.pointerId !== dragPointerIdRef.current) return;
        if (event.currentTarget.hasPointerCapture(dragPointerIdRef.current)) {
            event.currentTarget.releasePointerCapture(dragPointerIdRef.current);
        }
        dragPointerIdRef.current = null;
        panelRef.current?.classList.remove("is-dragging");
    }, []);

    useEffect(() => {
        const handleResize = () => {
            const panel = panelRef.current;
            if (!panel || !panel.style.left || !panel.style.top) return;
            const left = parseFloat(panel.style.left);
            const top = parseFloat(panel.style.top);
            if (Number.isNaN(left) || Number.isNaN(top)) return;
            updatePosition(left, top);
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [updatePosition]);

    const total = times.length > 0 ? times[times.length - 1] : 0;
    const count = times.length;
    const elapsed = index > 0 ? times[Math.min(index, count) - 1] ?? 0 : 0;
    /** Share of the recording's length at an event index, 0–100. */
    const at = (i: number) => {
        if (count === 0) return 0;
        if (total > 0) return ((times[Math.min(i, count - 1)] ?? 0) / total) * 100;
        return (i / count) * 100;
    };

    const activity = useMemo(() => {
        const slices = new Array<number>(TIMELINE_SLICES).fill(0);
        if (times.length === 0) return slices;
        const span = Math.max(1, times[times.length - 1]);
        times.forEach(t => {
            slices[Math.min(TIMELINE_SLICES - 1, Math.floor((t / span) * TIMELINE_SLICES))]++;
        });
        const max = Math.max(1, ...slices);
        return slices.map(v => (v === 0 ? 0 : Math.max(0.12, v / max)));
    }, [times]);

    const handlePauseClick = () => {
        if (paused) {
            recordingManager.resumePlayback();
        } else {
            recordingManager.pausePlayback();
        }
    };

    const hasA = loop.start !== null;
    const hasB = loop.end !== null;
    const loopLeft = hasA ? at(loop.start!) : 0;
    const loopRight = hasB ? at(loop.end!) : 100;
    const progress = count > 0 ? (index >= count ? 100 : at(index)) : 0;

    return createPortal(
        <div id="playback-controls" ref={panelRef} style={visible ? undefined : { display: "none" }}>
            <div
                className="playback-head"
                onPointerDown={handleDragHandlePointerDown}
                onPointerMove={handleDragHandlePointerMove}
                onPointerUp={handleDragHandlePointerUp}
                onPointerCancel={handleDragHandlePointerUp}
            >
                <span className="playback-head__title">
                    <Play size={10} fill="currentColor" strokeWidth={0} />
                    Odtwarzanie
                </span>
                <button id="playback-stop" type="button" className="playback-icon" title="Zakończ odtwarzanie" onClick={() => recordingManager.stopPlayback()}>
                    <Square size={11} fill="currentColor" strokeWidth={0} />
                </button>
            </div>

            <div className="playback-body">
                <div className="playback-name" title={name}>{name || "Nagranie"}</div>

                <div className="playback-timeline">
                    <div className="playback-timeline__activity">
                        {activity.map((v, i) => <span key={i} style={{ height: `${v * 100}%` }} />)}
                    </div>
                    {(hasA || hasB) && (
                        <div
                            className={`playback-timeline__loop${loop.enabled ? " is-on" : ""}${hasA ? " has-a" : ""}${hasB ? " has-b" : ""}`}
                            style={{ left: `${loopLeft}%`, width: `${Math.max(0, loopRight - loopLeft)}%` }}
                        />
                    )}
                    <div className="playback-timeline__track">
                        <div className="playback-timeline__fill" style={{ width: `${progress}%` }} />
                    </div>
                    <span className="playback-timeline__head" style={{ left: `${progress}%` }} />
                </div>
                <div className="playback-times">
                    <span>{clock(elapsed)}</span>
                    <span id="playback-info" className="playback-times__events">
                        {index} / {count}
                        {timer && <span id="playback-timer"> · za {timer}</span>}
                    </span>
                    <span>{clock(total)}</span>
                </div>

                <div className="playback-transport">
                    <button id="playback-start-over" type="button" className="playback-icon" title="Od początku" onClick={() => recordingManager.startOver()}>
                        <SkipBack size={15} strokeWidth={1.75} />
                    </button>
                    <button id="playback-step-back" type="button" className="playback-icon" title="Krok wstecz" onClick={() => recordingManager.stepBack()}>
                        <StepBack size={16} strokeWidth={1.75} />
                    </button>
                    <button id="playback-pause" type="button" className="playback-play" title={paused ? "Odtwarzaj" : "Pauza"} onClick={handlePauseClick}>
                        {paused
                            ? <Play size={15} fill="currentColor" strokeWidth={0} />
                            : <Pause size={15} fill="currentColor" strokeWidth={0} />}
                    </button>
                    <button id="playback-step" type="button" className="playback-icon" title="Krok naprzód" onClick={() => recordingManager.stepForward()}>
                        <StepForward size={16} strokeWidth={1.75} />
                    </button>
                    <button id="playback-replay" type="button" className="playback-icon" title="Powtórz ostatnie zdarzenie" onClick={() => recordingManager.replayLast()}>
                        <RotateCcw size={15} strokeWidth={1.75} />
                    </button>
                </div>

                <div className="playback-row">
                    <span className="playback-row__label">Prędkość</span>
                    <div className="dialog-tabs playback-speeds">
                        {SPEEDS.map(s => (
                            <button
                                key={s}
                                type="button"
                                className={`dialog-tab${Math.abs(speed - s) < 0.01 ? " is-active" : ""}`}
                                data-speed={s}
                                onClick={() => recordingManager.setPlaybackSpeed(s)}
                            >
                                {speedLabel(s)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="playback-row">
                    <span className="playback-row__label">Pętla</span>
                    <div className="playback-loop">
                        <button id="playback-loop-set-start" type="button" className={`playback-mark${hasA ? " is-set" : ""}`} title="Ustaw początek pętli tutaj" onClick={() => recordingManager.setLoopStart()}>A</button>
                        <button id="playback-loop-set-end" type="button" className={`playback-mark${hasB ? " is-set" : ""}`} title="Ustaw koniec pętli tutaj" onClick={() => recordingManager.setLoopEnd()}>B</button>
                        <button
                            id="playback-loop-toggle"
                            type="button"
                            className={`playback-loop__toggle${loop.enabled ? " is-on" : ""}`}
                            data-loop-enabled={loop.enabled ? "true" : "false"}
                            disabled={!hasA || !hasB}
                            title={hasA && hasB ? "Włącz lub wyłącz pętlę" : "Najpierw ustaw A i B"}
                            onClick={() => recordingManager.toggleLoop()}
                        >
                            <Repeat size={13} strokeWidth={1.9} />
                            {hasA && hasB ? `${clock(times[loop.start!] ?? 0)}–${clock(times[loop.end!] ?? 0)}` : "A–B"}
                        </button>
                        {(hasA || hasB) && (
                            <button id="playback-loop-clear" type="button" className="playback-icon playback-icon--sm" title="Usuń pętlę" onClick={() => recordingManager.clearLoop()}>
                                <X size={13} strokeWidth={2} />
                            </button>
                        )}
                    </div>
                </div>

                {lastEvent && <div className="playback-last" title={lastEvent}>{lastEvent}</div>}
            </div>
        </div>,
        document.body
    );
};
