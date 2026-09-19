import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allChannelsOff, allChannelsOn, anyChannelOff, type Channel } from "./model/channels";
import { formatClock, pluralLogs } from "./model/format";
import { indexAtOrAfter } from "./model/timeline";
import type { Density, LogSession, SearchScope } from "./model/types";
import {
    applyPreferences,
    deriveView,
    initialSessionId,
    initialViewerState,
    pickPreferences,
    stepMatch,
    type PersistedPreferences,
    type ViewerState,
} from "./model/viewerState";
import { ChannelBar } from "./components/ChannelBar";
import { LogPane, type ScrollRequest } from "./components/LogPane";
import { SearchBar } from "./components/SearchBar";
import { SessionSidebar } from "./components/SessionSidebar";
import { StatusBar } from "./components/StatusBar";
import { Timeline } from "./components/Timeline";
import { ViewerHeader } from "./components/ViewerHeader";
import "./logViewer.css";

export interface LogViewerProps {
    sessions: LogSession[];
    /** Rendered at the right end of the header — a close control, typically. */
    headerTrailing?: React.ReactNode;
    /** Preferences to restore; `onPreferencesChange` reports them back. */
    preferences?: PersistedPreferences | null;
    onPreferencesChange?: (preferences: PersistedPreferences) => void;
    /** Called instead of the built-in `navigator.clipboard` write, if given. */
    onCopy?: (text: string) => void;
    onExport?: (session: LogSession, text: string) => void;
}

const LINE_HEIGHT: Record<Density, number> = { compact: 21, comfortable: 26 };

/** Search is cheap up to here; past it the query is debounced. */
const DEBOUNCE_THRESHOLD_LINES = 4000;
const DEBOUNCE_MS = 100;

export function LogViewer({
    sessions,
    headerTrailing,
    preferences,
    onPreferencesChange,
    onCopy,
    onExport,
}: LogViewerProps) {
    const [state, setState] = useState<ViewerState>(() => {
        const preferredId = preferences?.sessionId;
        const initialId =
            preferredId && sessions.some((session) => session.id === preferredId)
                ? preferredId
                : initialSessionId(sessions);
        return applyPreferences(initialViewerState(initialId), preferences);
    });

    /**
     * The query the derivation actually runs on. Equal to `state.query` except
     * during the debounce window on a large log, so typing never blocks on a
     * full re-scan.
     */
    const [activeQuery, setActiveQuery] = useState(state.query);
    const [viewport, setViewport] = useState<{ from: number; to: number } | null>(null);
    const [scrollRequest, setScrollRequest] = useState<ScrollRequest | null>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const rootRef = useRef<HTMLDivElement>(null);
    const scrollToken = useRef(0);

    const patch = useCallback((changes: Partial<ViewerState>) => {
        setState((previous) => ({ ...previous, ...changes }));
    }, []);

    const requestScroll = useCallback((request: Omit<ScrollRequest, "token">) => {
        scrollToken.current += 1;
        setScrollRequest({ ...request, token: scrollToken.current });
    }, []);

    /* --- selection fallbacks ------------------------------------------- */

    useEffect(() => {
        if (sessions.length === 0) return;
        if (sessions.some((session) => session.id === state.sessionId)) return;
        patch({ sessionId: initialSessionId(sessions), matchIndex: 0 });
    }, [sessions, state.sessionId, patch]);

    /* --- debounced query ------------------------------------------------ */

    const activeSessionLineCount = useMemo(
        () => sessions.find((session) => session.id === state.sessionId)?.lines.length ?? 0,
        [sessions, state.sessionId],
    );

    useEffect(() => {
        if (activeSessionLineCount < DEBOUNCE_THRESHOLD_LINES) {
            setActiveQuery(state.query);
            return;
        }
        const timer = window.setTimeout(() => setActiveQuery(state.query), DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [state.query, activeSessionLineCount]);

    const view = useMemo(
        () => deriveView(sessions, { ...state, query: activeQuery }),
        [sessions, state, activeQuery],
    );

    /* --- preference persistence ----------------------------------------- */

    // Only the persisted slice is watched — depending on the whole of `state`
    // would rewrite preferences on every keystroke in the search box.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the listed fields ARE every field pickPreferences reads
    const persisted = useMemo(() => pickPreferences(state), [
        state.channels,
        state.showTimestamps,
        state.showColors,
        state.wrap,
        state.scope,
        state.density,
        state.sessionId,
    ]);

    useEffect(() => {
        onPreferencesChange?.(persisted);
    }, [persisted, onPreferencesChange]);

    /* --- scroll targets -------------------------------------------------- */

    const currentRow = view.currentRow;

    // Centre the current match whenever it moves. Following live wins: a player
    // watching a live session does not want the view yanked to an old hit.
    useEffect(() => {
        if (state.follow) return;
        if (currentRow === null) return;
        requestScroll({ kind: "row", row: currentRow, align: "center" });
    }, [currentRow, state.follow, requestScroll]);

    // A new session starts at its end when live, at its top otherwise.
    const sessionId = state.sessionId;
    useEffect(() => {
        const session = sessions.find((candidate) => candidate.id === sessionId);
        if (!session) return;
        requestScroll({ kind: session.live ? "bottom" : "top" });
    }, [sessionId, sessions, requestScroll]);

    /* --- actions --------------------------------------------------------- */

    const stepSession = useCallback(
        (direction: 1 | -1) => {
            const order = view.visibleSessions;
            if (order.length === 0) return;
            const from = order.findIndex((session) => session.id === state.sessionId);
            const next = Math.max(0, Math.min(order.length - 1, (from < 0 ? 0 : from) + direction));
            if (order[next].id === state.sessionId) return;
            // Filters and the query are deliberately kept: comparing the same
            // search across sessions is the second thing this viewer is for.
            patch({ sessionId: order[next].id, matchIndex: 0, follow: false, notice: "" });
        },
        [view.visibleSessions, state.sessionId, patch],
    );

    const step = useCallback(
        (direction: 1 | -1) => {
            const result = stepMatch(direction, { ...state, query: activeQuery }, view, view.visibleSessions);
            if (!result) return;
            patch({
                matchIndex: result.matchIndex,
                notice: result.notice,
                follow: false,
                ...(result.sessionId ? { sessionId: result.sessionId } : {}),
            });
        },
        [state, activeQuery, view, patch],
    );

    const jumpToTime = useCallback(
        (timestamp: number, align: "start" | "center") => {
            if (view.rows.length === 0) return;
            const index = indexAtOrAfter(view.rows, timestamp);
            patch({ follow: false });
            requestScroll({ kind: "row", row: index, align });
        },
        [view.rows, patch, requestScroll],
    );

    const visibleText = useCallback(() => {
        if (!viewport) return "";
        return view.rows
            .filter((row) => row.timestamp >= viewport.from && row.timestamp <= viewport.to)
            .map((row) => (state.showTimestamps ? `${formatClock(row.timestamp)} ${row.text}` : row.text))
            .join("\n");
    }, [view.rows, viewport, state.showTimestamps]);

    const copyView = useCallback(() => {
        const text = visibleText();
        if (!text) return;
        if (onCopy) onCopy(text);
        else void navigator.clipboard?.writeText(text);
    }, [visibleText, onCopy]);

    const exportView = useCallback(() => {
        if (!view.session) return;
        const text = view.rows
            .map((row) => (state.showTimestamps ? `${formatClock(row.timestamp)} ${row.text}` : row.text))
            .join("\n");
        if (onExport) {
            onExport(view.session, text);
            return;
        }
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = view.session.file;
        anchor.click();
        URL.revokeObjectURL(url);
    }, [view.session, view.rows, state.showTimestamps, onExport]);

    /* --- keyboard -------------------------------------------------------- */

    const onRootKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            const target = event.target as HTMLElement | null;
            const inInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";

            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
                event.preventDefault();
                searchRef.current?.focus();
                searchRef.current?.select();
                return;
            }
            if (event.key === "F3") {
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
                return;
            }
            if (inInput) return;

            if (event.key === "]") stepSession(1);
            else if (event.key === "[") stepSession(-1);
            else if (event.key === "Home") {
                patch({ follow: false });
                requestScroll({ kind: "top" });
            } else if (event.key === "End") {
                requestScroll({ kind: "bottom" });
            }
        },
        [step, stepSession, patch, requestScroll],
    );

    const onSearchKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
            } else if (event.key === "Escape" && state.query) {
                // Clearing the query is what Escape means here; only an empty
                // field lets it through to close the dialog.
                event.stopPropagation();
                patch({ query: "", matchIndex: 0, notice: "" });
            }
        },
        [step, state.query, patch],
    );

    /* --- derived copy ---------------------------------------------------- */

    const { counter, counterTone } = useMemo(() => {
        if (view.invalidPattern) return { counter: "Bledny wzorzec", counterTone: "error" as const };
        if (!activeQuery) return { counter: "", counterTone: "normal" as const };
        if (view.totalMatches === 0) return { counter: "Brak trafien tutaj", counterTone: "muted" as const };
        return {
            counter: `${view.currentMatch + 1} z ${view.totalMatches}`,
            counterTone: "normal" as const,
        };
    }, [view.invalidPattern, view.totalMatches, view.currentMatch, activeQuery]);

    const { subLine, subIsNotice } = useMemo(() => {
        if (state.notice) return { subLine: state.notice, subIsNotice: true };
        if (!view.searching) return { subLine: "", subIsNotice: false };
        if (state.scope === "all") {
            const withHits = sessions.filter((session) => (view.hitsBySession[session.id] ?? 0) > 0).length;
            const total = sessions.reduce((sum, session) => sum + (view.hitsBySession[session.id] ?? 0), 0);
            return { subLine: `${total} w ${withHits} ${pluralLogs(withHits)}`, subIsNotice: false };
        }
        return { subLine: "Enter / Shift+Enter", subIsNotice: false };
    }, [state.notice, state.scope, view.searching, view.hitsBySession, sessions]);

    const emptyMessage = useMemo(() => {
        if (view.rows.length > 0) return null;
        if (allChannelsOff(state.channels)) return "Wszystkie kanaly sa ukryte.";
        if (state.onlyMatches && activeQuery) return `Zadna linia w tym logu nie pasuje do „${activeQuery}”.`;
        if (anyChannelOff(state.channels)) return "Nic do pokazania przy obecnych filtrach.";
        return "Ta sesja nie ma zapisanych linii.";
    }, [view.rows.length, state.channels, state.onlyMatches, activeQuery]);

    /* --- render ---------------------------------------------------------- */

    if (!view.session) {
        return (
            <div className="lv" ref={rootRef}>
                <div className="ark-empty-state">Brak zapisanych sesji.</div>
            </div>
        );
    }

    const order = view.visibleSessions;
    const positionInOrder = order.findIndex((session) => session.id === state.sessionId);
    const matchTimestamps = view.matches.map((match) => view.rows[match.row].timestamp);
    const currentMatchTimestamp =
        view.currentRow === null ? null : view.rows[view.currentRow].timestamp;
    return (
        <div
            className="lv"
            ref={rootRef}
            data-density={state.density}
            onKeyDown={onRootKeyDown}
            // The viewer owns its shortcuts only while focus is inside it: a
            // modal that listens on `window` steals keys from the game input.
            tabIndex={-1}
        >
            <ViewerHeader
                session={view.session}
                onPrevSession={() => stepSession(-1)}
                onNextSession={() => stepSession(1)}
                hasPrev={positionInOrder > 0}
                hasNext={positionInOrder >= 0 && positionInOrder < order.length - 1}
                onCopyView={copyView}
                onExport={exportView}
                trailing={headerTrailing}
            />

            <div className="lv__split">
                <SessionSidebar
                    sessions={sessions}
                    visibleSessions={view.visibleSessions}
                    selectedId={state.sessionId}
                    filter={state.sessionFilter}
                    onFilterChange={(value) => patch({ sessionFilter: value })}
                    onSelect={(id) => patch({ sessionId: id, matchIndex: 0, follow: false, notice: "" })}
                    hitsBySession={view.hitsBySession}
                    searching={view.searching}
                    allScope={state.scope === "all"}
                />

                <div className="lv__main">
                    <SearchBar
                        ref={searchRef}
                        query={state.query}
                        onQueryChange={(value) => patch({ query: value, matchIndex: 0, notice: "" })}
                        caseSensitive={state.caseSensitive}
                        onCaseSensitiveChange={(value) => patch({ caseSensitive: value, matchIndex: 0 })}
                        regex={state.regex}
                        onRegexChange={(value) => patch({ regex: value, matchIndex: 0 })}
                        onlyMatches={state.onlyMatches}
                        onOnlyMatchesChange={(value) => patch({ onlyMatches: value, matchIndex: 0 })}
                        scope={state.scope}
                        onScopeChange={(value: SearchScope) => patch({ scope: value, notice: "" })}
                        onStep={step}
                        onKeyDown={onSearchKeyDown}
                        counter={counter}
                        counterTone={counterTone}
                        subLine={subLine}
                        subIsNotice={subIsNotice}
                        invalid={view.invalidPattern}
                    />

                    <ChannelBar
                        channels={state.channels}
                        counts={view.channelCounts}
                        onToggle={(channel: Channel, on: boolean) =>
                            patch({ channels: { ...state.channels, [channel]: on }, matchIndex: 0 })
                        }
                        onShowAll={() => patch({ channels: allChannelsOn(), matchIndex: 0 })}
                    />

                    <Timeline
                        allLines={view.session.lines}
                        visibleLines={view.rows}
                        live={view.session.live}
                        matchTimestamps={matchTimestamps}
                        currentMatchTimestamp={currentMatchTimestamp}
                        viewport={viewport}
                        onJumpToTime={jumpToTime}
                        onJumpToStart={() => {
                            patch({ follow: false });
                            requestScroll({ kind: "top" });
                        }}
                        onJumpToEnd={() => requestScroll({ kind: "bottom" })}
                    />

                    <LogPane
                        rows={view.rows}
                        showTimestamps={state.showTimestamps}
                        showColors={state.showColors}
                        wrap={state.wrap}
                        lineHeight={LINE_HEIGHT[state.density]}
                        currentRow={view.currentRow}
                        currentOccurrence={
                            view.totalMatches ? view.matches[view.currentMatch].occurrence : -1
                        }
                        emptyMessage={emptyMessage}
                        onResetFilters={() =>
                            patch({ channels: allChannelsOn(), onlyMatches: false, matchIndex: 0 })
                        }
                        onViewportChange={setViewport}
                        onScrollAwayFromBottom={() => patch({ follow: false })}
                        follow={state.follow && view.session.live}
                        scrollRequest={scrollRequest}
                    />

                    <StatusBar
                        shownLines={view.rows.length}
                        totalLines={view.session.lines.length}
                        viewport={viewport}
                        showTimestamps={state.showTimestamps}
                        onShowTimestampsChange={(value) => patch({ showTimestamps: value })}
                        showColors={state.showColors}
                        onShowColorsChange={(value) => patch({ showColors: value })}
                        colorsAvailable={view.session.lines.some((line) => Boolean(line.html))}
                        wrap={state.wrap}
                        onWrapChange={(value) => patch({ wrap: value })}
                        density={state.density}
                        onDensityChange={(value) => patch({ density: value })}
                        live={view.session.live}
                        follow={state.follow}
                        onFollowChange={(value) => patch({ follow: value })}
                    />
                </div>
            </div>
        </div>
    );
}
