import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { allChannelsOff, allChannelsOn, anyChannelOff, type Channel } from "./model/channels";
import { charactersLabel } from "./model/characters";
import { formatClock, pluralLogs } from "./model/format";
import { indexAtOrAfter } from "./model/timeline";
import type { Density, LogSession, SearchScope, TimeRange } from "./model/types";
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
import { buildLogHtml, escapeHtml } from "./export/logHtml";
import { copyBlobToClipboard, downloadBlob, renderLogImage, type ImageStyle } from "./export/logImage";
import { ChannelBar } from "./components/ChannelBar";
import { LineMenu, type LineMenuState } from "./components/LineMenu";
import { LogPane, type ScrollRequest } from "./components/LogPane";
import { SearchBar } from "./components/SearchBar";
import { SessionSidebar } from "./components/SessionSidebar";
import { StatusBar } from "./components/StatusBar";
import { Timeline } from "./components/Timeline";
import { ViewerHeader } from "./components/ViewerHeader";
import "./logViewerTheme.css";
import "./ui/controls.css";
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
    /**
     * Rendered in the log pane when the store holds no sessions at all.
     *
     * The viewer knows there is nothing to read; it does not know what this
     * host can do about it. In the client that is an import button, so the
     * empty state leads somewhere; the standalone page has no way to write to
     * the database and passes nothing.
     */
    noSessionsAction?: React.ReactNode;
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
    noSessionsAction,
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
    const [lineMenu, setLineMenu] = useState<LineMenuState | null>(null);
    const [busy, setBusy] = useState(false);
    const [exportError, setExportError] = useState("");
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
    const sessionId = state.sessionId;

    /**
     * Set by `step` when a match carries the search into another session, and
     * consumed by the session-change scroll below.
     *
     * Both effects fire on the same render, and the session one runs last, so
     * without this the jump a player asked for landed at the top of the new log
     * and they had to click the hit a second time.
     */
    const matchJump = useRef<string | null>(null);

    // Centre the current match whenever it moves. `sessionId` is a dependency
    // as well: crossing into another log can land on the same row number, and
    // that jump still has to happen. Following live wins — a player watching a
    // live session does not want the view yanked to an old hit.
    useEffect(() => {
        if (state.follow) return;
        if (currentRow === null) return;
        requestScroll({ kind: "row", row: currentRow, align: "center" });
    }, [currentRow, sessionId, state.follow, requestScroll]);

    // A new session starts at its end when live, at its top otherwise.
    useEffect(() => {
        const session = sessions.find((candidate) => candidate.id === sessionId);
        if (!session) return;
        if (matchJump.current === sessionId) {
            matchJump.current = null;
            return;
        }
        requestScroll({ kind: session.live ? "bottom" : "top" });
    }, [sessionId, sessions, requestScroll]);

    /* --- scope and range ------------------------------------------------- */

    /**
     * The scope to fall back to once the range goes away.
     *
     * The in-client browser hardcodes "Ten log" (`LogBrowser.tsx:1671`), which
     * quietly ends a cross-log search the moment you drag a range. Remembering
     * what you were doing costs one ref.
     */
    const scopeBeforeRange = useRef<SearchScope>("log");

    const selectScope = useCallback(
        (scope: SearchScope) => {
            if (scope !== "range") scopeBeforeRange.current = scope;
            // The match set changes with the scope, so the counter starts over —
            // this is what "zmiana zakresu przeszukuje ponownie" amounts to when
            // the search is derived rather than run.
            patch({ scope, matchIndex: 0, notice: "" });
        },
        [patch],
    );

    // A range appearing narrows the search to it; the range going away widens
    // the search back out. Mirrors `LogBrowser.tsx:1668-1675`.
    const hasRange = state.range !== null;
    useEffect(() => {
        setState((previous) => {
            if (hasRange && previous.scope !== "range") {
                scopeBeforeRange.current = previous.scope;
                return { ...previous, scope: "range", matchIndex: 0, notice: "" };
            }
            if (!hasRange && previous.scope === "range") {
                return { ...previous, scope: scopeBeforeRange.current, matchIndex: 0, notice: "" };
            }
            return previous;
        });
    }, [hasRange]);

    // A range belongs to the session it was drawn on; carrying it across would
    // silently hide most of the log you just opened.
    useEffect(() => {
        setLineMenu(null);
        setExportError("");
        setState((previous) => (previous.range ? { ...previous, range: null } : previous));
    }, [sessionId]);

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
            if (result.sessionId) matchJump.current = result.sessionId;
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

    /* --- range ----------------------------------------------------------- */

    const setRangeBound = useCallback(
        (edge: "from" | "to", timestamp: number) => {
            setLineMenu(null);
            setState((previous) => {
                const lines = sessions.find((entry) => entry.id === previous.sessionId)?.lines ?? [];
                const first = lines[0]?.timestamp ?? timestamp;
                const last = lines[lines.length - 1]?.timestamp ?? timestamp;
                let from = previous.range?.from ?? first;
                let to = previous.range?.to ?? last;
                // Each bound is clamped by the other, so a range can never
                // invert into an empty log.
                if (edge === "from") from = Math.min(timestamp, to);
                else to = Math.max(timestamp, from);
                const range = from <= first && to >= last ? null : { from, to };
                return { ...previous, range, matchIndex: 0 };
            });
            // Reveal the bound that was just set: "start here" lands at the top,
            // "end here" at the bottom of the narrowed slice.
            requestScroll({ kind: edge === "from" ? "top" : "bottom" });
        },
        [sessions, requestScroll],
    );

    const setRange = useCallback(
        (range: TimeRange | null) => {
            setState((previous) => ({ ...previous, range, matchIndex: 0 }));
        },
        [],
    );

    const clearRange = useCallback(() => {
        setLineMenu(null);
        setRange(null);
    }, [setRange]);

    /* --- export ---------------------------------------------------------- */

    /**
     * Base file name for exports, marked when a range is in force.
     *
     * It follows the APPLIED range, not the selected one: every export works on
     * `view.rows`, and those are only narrowed in "Zakres" scope. A file named
     * `_zakres` that held the whole log would be a lie about its own contents.
     */
    const exportName = useCallback(
        (extension: string) => {
            const base = (view.session?.file ?? "log").replace(/\.[^.]+$/, "");
            return `${base}${view.range ? "_zakres" : ""}.${extension}`;
        },
        [view.session, view.range],
    );

    const plainText = useCallback(
        () =>
            view.rows
                .map((row) => (state.showTimestamps ? `${formatClock(row.timestamp)} ${row.text}` : row.text))
                .join("\n"),
        [view.rows, state.showTimestamps],
    );

    const exportText = useCallback(() => {
        if (!view.session) return;
        const text = plainText();
        if (onExport) {
            onExport(view.session, text);
            return;
        }
        downloadBlob(new Blob([text], { type: "text/plain;charset=utf-8" }), exportName("txt"));
    }, [view.session, plainText, onExport, exportName]);

    /**
     * Resolves the design tokens the exporters need into plain CSS colours.
     *
     * A saved file cannot carry our token layer with it, and the canvas has no
     * concept of custom properties at all, so both ask the live pane what the
     * current theme actually resolved to.
     */
    const readPaneStyle = useCallback(() => {
        const pane = rootRef.current?.querySelector(".lv-log");
        const source = pane ?? rootRef.current;
        if (!source) return null;
        const computed = window.getComputedStyle(source);
        const time = rootRef.current?.querySelector(".lv-log__time");
        return {
            pane: pane as HTMLElement | null,
            background: computed.backgroundColor || "#111110",
            text: computed.color || "#eeeeec",
            timeColor: time ? window.getComputedStyle(time).color : computed.color,
            fontSize: parseFloat(computed.fontSize) || 13,
            fontFamily: computed.fontFamily || "monospace",
        };
    }, []);

    const exportHtml = useCallback(() => {
        if (!view.session) return;
        const style = readPaneStyle();
        const html = buildLogHtml(view.rows, {
            title: charactersLabel(view.session.characters, view.session.dateLabel),
            meta: [
                view.session.dateLabel,
                view.range
                    ? `zakres ${formatClock(view.range.from)}\u2013${formatClock(view.range.to)}`
                    : "caly log",
                `${view.rows.length} z ${view.session.lines.length} linii`,
            ].join("  \u00b7  "),
            showTimestamps: state.showTimestamps,
            showMeta: state.showMeta,
            showColors: state.showColors,
            palette: {
                background: style?.background ?? "#111110",
                text: style?.text ?? "#eeeeec",
                secondary: "#b5b3ad",
                faint: "#7c7b74",
                border: "#3b3a37",
                accent: "#ffc53d",
            },
        });
        downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), exportName("html"));
    }, [view.session, view.rows, view.range, state.showTimestamps, state.showMeta, state.showColors, readPaneStyle, exportName]);

    /** Renders what is on screen to a PNG, then hands it to `deliver`. */
    const withImage = useCallback(
        async (deliver: (blob: Blob) => void | Promise<void>) => {
            if (busy) return;
            if (view.rows.length === 0) {
                setExportError("Brak linii do zapisu.");
                return;
            }
            const style = readPaneStyle();
            if (!style) return;
            setBusy(true);
            setExportError("");
            try {
                const imageStyle: ImageStyle = {
                    bgColor: style.background,
                    defaultColor: style.text,
                    timeColor: style.timeColor,
                    fontSize: style.fontSize,
                    fontFamily: style.fontFamily,
                    containerWidth: Math.max(320, (style.pane?.clientWidth ?? 900) - 48),
                };
                const blob = await renderLogImage(
                    view.rows.map((row) => ({
                        time: state.showTimestamps ? formatClock(row.timestamp) : undefined,
                        // Mirror the pane: the game's colours when they are on,
                        // escaped plain text when they are not.
                        html: state.showColors && row.html ? row.html : escapeHtml(row.text),
                    })),
                    imageStyle,
                );
                await deliver(blob);
            } catch (error) {
                setExportError(error instanceof Error ? error.message : "Nie udalo sie utworzyc obrazu.");
            } finally {
                setBusy(false);
            }
        },
        [busy, view.rows, state.showTimestamps, state.showColors, readPaneStyle],
    );

    const downloadImage = useCallback(
        () => void withImage((blob) => downloadBlob(blob, exportName("png"))),
        [withImage, exportName],
    );

    const copyImage = useCallback(
        () => void withImage((blob) => copyBlobToClipboard(blob)),
        [withImage],
    );

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
                event.preventDefault();
                patch({ follow: false });
                requestScroll({ kind: "top" });
            } else if (event.key === "End") {
                event.preventDefault();
                requestScroll({ kind: "bottom" });
            } else if (event.key === "PageUp" || event.key === "PageDown") {
                // Paging is a plain scroll, not a jump to a row: it is NOT
                // marked programmatic, so paging up off the bottom releases
                // follow exactly as dragging the scrollbar would.
                event.preventDefault();
                requestScroll({ kind: "page", delta: event.key === "PageDown" ? 1 : -1 });
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
        if (!view.session) return "Nie ma tu jeszcze zadnego zapisanego logu.";
        if (allChannelsOff(state.channels)) return "Wszystkie kanaly sa ukryte.";
        if (state.onlyMatches && activeQuery) return `Zadna linia w tym logu nie pasuje do „${activeQuery}”.`;
        if (anyChannelOff(state.channels)) return "Nic do pokazania przy obecnych filtrach.";
        return "Ta sesja nie ma zapisanych linii.";
    }, [view.rows.length, view.session, state.channels, state.onlyMatches, activeQuery]);

    /* --- render ---------------------------------------------------------- */

    /**
     * An empty store renders the chrome anyway.
     *
     * The viewer used to return early here with "Brak zapisanych sesji." and
     * nothing else, which cut off the header along with everything hanging off
     * it — including the client's import button, which is exactly what a player
     * with no logs wants. The session-shaped parts stand down; the rest works.
     */
    const session = view.session;

    // The histogram must show activity OUTSIDE the range too, or the part of
    // the track you need in order to move the handles is empty.
    const activityLines = view.range
        ? (session?.lines ?? []).filter((line) => state.channels[line.channel])
        : view.rows;

    const order = view.visibleSessions;
    const positionInOrder = order.findIndex((entry) => entry.id === state.sessionId);
    const matchTimestamps = view.matches.map((match) => view.rows[match.row].timestamp);
    const currentMatchTimestamp =
        view.currentRow === null ? null : view.rows[view.currentRow].timestamp;
    return (
        <div
            className="lv lv-theme"
            ref={rootRef}
            data-density={state.density}
            onKeyDown={onRootKeyDown}
            // The viewer owns its shortcuts only while focus is inside it: a
            // modal that listens on `window` steals keys from the game input.
            tabIndex={-1}
        >
            <ViewerHeader
                session={session}
                onPrevSession={() => stepSession(-1)}
                onNextSession={() => stepSession(1)}
                hasPrev={positionInOrder > 0}
                hasNext={positionInOrder >= 0 && positionInOrder < order.length - 1}
                onCopyView={copyView}
                onExportText={exportText}
                onExportHtml={exportHtml}
                onDownloadImage={downloadImage}
                onCopyImage={copyImage}
                busy={busy}
                ranged={view.range !== null}
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
                    {session ? (
                        <>
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
                            onScopeChange={selectScope}
                            hasRange={hasRange}
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
                            allLines={session.lines}
                            activityLines={activityLines}
                            live={session.live}
                            matchTimestamps={matchTimestamps}
                            currentMatchTimestamp={currentMatchTimestamp}
                            viewport={viewport}
                            onJumpToTime={jumpToTime}
                            onJumpToStart={() => {
                                patch({ follow: false });
                                requestScroll({ kind: "top" });
                            }}
                            onJumpToEnd={() => requestScroll({ kind: "bottom" })}
                            range={state.range}
                            rangeActive={view.range !== null}
                            onRangeChange={setRange}
                        />
                        </>
                    ) : null}

                    <LogPane
                        rows={view.rows}
                        sessionKey={session?.id ?? "brak"}
                        showTimestamps={state.showTimestamps}
                        showMeta={state.showMeta}
                        showColors={state.showColors}
                        wrap={state.wrap}
                        lineHeight={LINE_HEIGHT[state.density]}
                        currentRow={view.currentRow}
                        currentOccurrence={
                            view.totalMatches ? view.matches[view.currentMatch].occurrence : -1
                        }
                        emptyMessage={emptyMessage}
                        emptyAction={session ? undefined : noSessionsAction}
                        onResetFilters={() =>
                            patch({ channels: allChannelsOn(), onlyMatches: false, matchIndex: 0 })
                        }
                        onViewportChange={setViewport}
                        onScrollAwayFromBottom={() => patch({ follow: false })}
                        follow={state.follow && Boolean(session?.live)}
                        scrollRequest={scrollRequest}
                        onLineContextMenu={(event, row) => {
                            event.preventDefault();
                            setLineMenu({
                                x: event.clientX,
                                y: event.clientY,
                                timestamp: row.timestamp,
                                lineNumber: row.number,
                            });
                        }}
                    />

                    <StatusBar
                        shownLines={view.rows.length}
                        totalLines={session?.lines.length ?? 0}
                        viewport={viewport}
                        range={state.range}
                        rangeActive={view.range !== null}
                        onClearRange={clearRange}
                        error={exportError}
                        showTimestamps={state.showTimestamps}
                        onShowTimestampsChange={(value) => patch({ showTimestamps: value })}
                        showMeta={state.showMeta}
                        onShowMetaChange={(value) => patch({ showMeta: value })}
                        showColors={state.showColors}
                        onShowColorsChange={(value) => patch({ showColors: value })}
                        colorsAvailable={(session?.lines ?? []).some((line) => Boolean(line.html))}
                        wrap={state.wrap}
                        onWrapChange={(value) => patch({ wrap: value })}
                        density={state.density}
                        onDensityChange={(value) => patch({ density: value })}
                        live={Boolean(session?.live)}
                        follow={state.follow}
                        onFollowChange={(value) => patch({ follow: value })}
                    />
                </div>
            </div>

            {lineMenu ? (
                <LineMenu
                    menu={lineMenu}
                    hasRange={state.range !== null}
                    boundary={rootRef}
                    onSetBound={setRangeBound}
                    onClearRange={clearRange}
                    onClose={() => setLineMenu(null)}
                />
            ) : null}
        </div>
    );
}
