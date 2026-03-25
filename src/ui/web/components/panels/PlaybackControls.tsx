import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useClientEvent } from "../../hooks";
import recordingManager from "@web/RecordingManager";
import eventBus from "@modules/core/eventBus";
import type { RecordedEvent } from "@shared/recorder/Recorder";

type PlaybackLoopState = {
    start: number | null;
    end: number | null;
    enabled: boolean;
};

const sliderToSpeed = (sliderValue: number): number => Math.pow(2, sliderValue);
const speedToSlider = (speed: number): number => Math.log2(speed);

export const PlaybackControls: React.FC = () => {
    const [visible, setVisible] = useState(false);
    const [paused, setPaused] = useState(true);
    const [info, setInfo] = useState("");
    const [timer, setTimer] = useState("");
    const [loopInfo, setLoopInfo] = useState("");
    const [loopEnabled, setLoopEnabled] = useState(false);
    const [speed, setSpeed] = useState(() => recordingManager.getPlaybackSpeed());
    const [previewText, setPreviewText] = useState("");
    const [previewCollapsed, setPreviewCollapsed] = useState(true);

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

    useClientEvent("recording.loaded", (data: { name: string; length: number }) => {
        setVisible(true);
        setInfo(`Wczytano: ${data.name} (${data.length} zdarzeń)`);
        setPaused(true);
        setSpeed(recordingManager.getPlaybackSpeed());
    });

    useClientEvent("playback.start", (total: number | undefined) => {
        setVisible(true);
        setInfo(`0 / ${total}`);
        setPaused(false);
        setSpeed(recordingManager.getPlaybackSpeed());
    });

    useClientEvent("playback.stop", () => {
        setVisible(false);
        clearTimerInterval();
        setTimer("");
    });

    useClientEvent("playback.pause", () => {
        setPaused(true);
        clearTimerInterval();
    });

    useClientEvent("playback.resume", () => {
        setPaused(false);
    });

    useEffect(() => {
        return eventBus.on("playback.index", (current: number, total: number) => {
            setInfo(`${current} / ${total}`);
        });
    }, []);

    useClientEvent("playback.speed", (newSpeed: number) => {
        setSpeed(newSpeed);
    });

    useClientEvent("playback.event", (event: RecordedEvent) => {
        const direction = event.direction === "in" ? "←" : "→";
        setPreviewText(`${direction} ${event.message}`);
    });

    useClientEvent("playback.loop.updated", (loopState: PlaybackLoopState) => {
        setLoopEnabled(loopState.enabled);
        if (loopState.start !== null && loopState.end !== null) {
            setLoopInfo(`Pętla: ${loopState.start} - ${loopState.end}`);
        } else if (loopState.start !== null) {
            setLoopInfo(`Początek pętli: ${loopState.start}`);
        } else if (loopState.end !== null) {
            setLoopInfo(`Koniec pętli: ${loopState.end}`);
        } else {
            setLoopInfo("");
        }
    });

    useClientEvent("playback.timer", (data: { delay: number; startTime: number }) => {
        clearTimerInterval();

        const updateTimer = () => {
            const elapsed = Date.now() - data.startTime;
            const remaining = Math.max(0, data.delay - elapsed);
            if (remaining <= 0) {
                setTimer("0.0s");
                clearTimerInterval();
            } else {
                setTimer(`${(remaining / 1000).toFixed(1)}s`);
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
        const width = panel.offsetWidth;
        const height = panel.offsetHeight;
        const maxX = Math.max(margin, window.innerWidth - width - margin);
        const maxY = Math.max(margin, window.innerHeight - height - margin);
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
        if (event.button !== 0) return;
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

    const handlePauseClick = () => {
        if (paused) {
            recordingManager.resumePlayback();
        } else {
            recordingManager.pausePlayback();
        }
    };

    const handleSpeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const sliderValue = parseFloat(event.target.value);
        recordingManager.setPlaybackSpeed(sliderToSpeed(sliderValue));
    };

    return createPortal(
        <div id="playback-controls" ref={panelRef} style={visible ? undefined : { display: "none" }}>
            <div
                className="playback-controls-header"
                onPointerDown={handleDragHandlePointerDown}
                onPointerMove={handleDragHandlePointerMove}
                onPointerUp={handleDragHandlePointerUp}
                onPointerCancel={handleDragHandlePointerUp}
            >
                <span className="playback-controls-title">Sterowanie nagraniem</span>
            </div>
            <div className="playback-speed-controls">
                <label htmlFor="playback-speed-slider" className="playback-speed-label">
                    Prędkość: <span className="playback-speed-value">{speed.toFixed(1)}x</span>
                </label>
                <input
                    type="range"
                    id="playback-speed-slider"
                    className="playback-speed-slider"
                    min="-1"
                    max="4"
                    step="0.1"
                    value={speedToSlider(speed)}
                    onChange={handleSpeedChange}
                />
            </div>
            <div className="playback-controls-actions">
                <button id="playback-pause" className="btn btn-secondary" onClick={handlePauseClick}>
                    {paused ? "▶" : "⏸"}
                </button>
                <button id="playback-stop" className="btn btn-secondary" onClick={() => recordingManager.stopPlayback()}>⏹</button>
                <button id="playback-start-over" className="btn btn-secondary" onClick={() => recordingManager.startOver()}>Od początku</button>
                <button id="playback-replay" className="btn btn-secondary" onClick={() => recordingManager.replayLast()}>Powtórz</button>
                <button id="playback-step-back" className="btn btn-secondary" onClick={() => recordingManager.stepBack()}>Wstecz</button>
                <button id="playback-step" className="btn btn-secondary" onClick={() => recordingManager.stepForward()}>Krok</button>
            </div>
            <div className="playback-loop-controls">
                <button id="playback-loop-set-start" className="btn btn-secondary" onClick={() => recordingManager.setLoopStart()}>Początek pętli</button>
                <button id="playback-loop-set-end" className="btn btn-secondary" onClick={() => recordingManager.setLoopEnd()}>Koniec pętli</button>
                <button
                    id="playback-loop-toggle"
                    className="btn btn-secondary"
                    data-loop-enabled={loopEnabled ? "true" : "false"}
                    onClick={() => recordingManager.toggleLoop()}
                >
                    {loopEnabled ? "Pętla: WŁ" : "Pętla: WYŁ"}
                </button>
                <button id="playback-loop-clear" className="btn btn-secondary" onClick={() => recordingManager.clearLoop()}>Wyczyść pętlę</button>
            </div>
            <div className="playback-controls-progress-container">
                <div id="playback-info" className="playback-controls-progress">{info}</div>
                {timer && <div id="playback-timer" className="playback-controls-timer">{timer}</div>}
            </div>
            {loopInfo && <div id="playback-loop-info" className="playback-controls-loop-info">{loopInfo}</div>}
            <div className="playback-preview-section">
                <button
                    className={`playback-preview-toggle${previewCollapsed ? " collapsed" : ""}`}
                    onClick={() => setPreviewCollapsed((c) => !c)}
                >
                    <span className="playback-preview-toggle-icon">▼</span>
                    Ostatnie zdarzenie
                </button>
                {!previewCollapsed && (
                    <div className="playback-preview-content">
                        <div className="playback-preview-text">{previewText}</div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};
