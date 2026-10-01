import { Badge, Button, Field, Input, Kbd } from "../ui";
import { charactersLabel } from "../model/characters";
import { formatClock, formatDuration, pluralSessions } from "../model/format";
import type { LogSessionInfo } from "../model/types";

interface SessionGroup {
    label: string;
    sessions: LogSessionInfo[];
}

function groupByDay(sessions: LogSessionInfo[]): SessionGroup[] {
    const groups: SessionGroup[] = [];
    for (const session of sessions) {
        const last = groups[groups.length - 1];
        if (last && last.label === session.dayLabel) {
            last.sessions.push(session);
        } else {
            groups.push({ label: session.dayLabel, sessions: [session] });
        }
    }
    return groups;
}

export interface SessionSidebarProps {
    sessions: LogSessionInfo[];
    visibleSessions: LogSessionInfo[];
    selectedId: string;
    filter: string;
    onFilterChange: (value: string) => void;
    onSelect: (id: string) => void;
    hitsBySession: Record<string, number>;
    /** True while a query is active — drives whether badges show at all. */
    searching: boolean;
    /** In All-logs scope every session shows its hit count, not just the open one. */
    allScope: boolean;
    /**
     * In All-logs scope the list holds only the sessions with hits (and the
     * open one) unless this is set — "Pokaż wszystkie" in the foot.
     */
    showAll: boolean;
    onShowAllChange: (value: boolean) => void;
    /** Set while the host is still listing sessions. */
    loading?: { done: number; total: number } | null;
    /** Shown above the list: sessions the host has that are not listed yet. */
    notice?: string;
    /**
     * Whether the drawer is showing. Meaningless on a wide screen, where the
     * sidebar is docked and this attribute is not styled at all.
     */
    open: boolean;
}

export function SessionSidebar({
    sessions,
    visibleSessions,
    selectedId,
    filter,
    onFilterChange,
    onSelect,
    hitsBySession,
    searching,
    allScope,
    showAll,
    onShowAllChange,
    loading,
    notice,
    open,
}: SessionSidebarProps) {
    // Searching every log asks "where did this happen", and the answer is the
    // sessions that have it: they become the list, each as soon as it is
    // counted. The open one stays, so the player never loses their place.
    const narrowed = searching && allScope && !showAll;
    const hasHits = (session: LogSessionInfo) => (hitsBySession[session.id] ?? 0) > 0;
    const listed = narrowed
        ? visibleSessions.filter((session) => hasHits(session) || session.id === selectedId)
        : visibleSessions;
    const groups = groupByDay(listed);
    const total = sessions.length;
    const shown = listed.length;

    return (
        <div className="lv-sidebar" data-open={open}>
            <div className="lv-sidebar__head">
                <Field label={narrowed ? "Sesje z trafieniami" : "Sesje"} eyebrow htmlFor="lv-session-filter">
                    <Input
                        id="lv-session-filter"
                        value={filter}
                        onChange={(event) => onFilterChange(event.target.value)}
                        placeholder="Filtruj po postaci lub dacie"
                        autoComplete="off"
                    />
                </Field>
            </div>

            <div className="lv-sidebar__list">
                {notice ? <div className="lv-sidebar__notice">{notice}</div> : null}
                {groups.length === 0 ? (
                    <div className="lv-sidebar__group">
                        {total === 0
                            ? "Nie ma jeszcze żadnego logu."
                            : narrowed
                              ? "Żadna sesja nie ma trafień."
                              : "Brak sesji pasujących do filtra."}
                    </div>
                ) : null}
                {groups.map((group) => (
                    <div key={group.label}>
                        <div className="lv-sidebar__group">{group.label}</div>
                        <div className="lv-sidebar__items">
                            {group.sessions.map((session) => {
                                const selected = session.id === selectedId;
                                const hits = hitsBySession[session.id] ?? 0;
                                const showHits = searching && hits > 0 && (allScope || selected);
                                return (
                                    <button
                                        key={session.id}
                                        type="button"
                                        className="lv-session"
                                        data-selected={selected}
                                        data-dimmed={searching && allScope && hits === 0 && !selected}
                                        onClick={() => onSelect(session.id)}
                                    >
                                        <span className="lv-row lv-row--tight">
                                            <span className="lv-session__name lv-truncate">
                                                {charactersLabel(session.characters, session.dateLabel)}
                                            </span>
                                            {session.live ? (
                                                <span className="lv-session__live" title="Nagrywana teraz" />
                                            ) : null}
                                            {showHits ? (
                                                <Badge
                                                    tone={selected ? "accent" : "accent-soft"}
                                                    title="Trafienia w tej sesji"
                                                >
                                                    {hits}
                                                </Badge>
                                            ) : null}
                                        </span>
                                        <span className="lv-session__range">
                                            {formatClock(session.startedAt, true)}
                                            {"–"}
                                            {session.live ? "teraz" : formatClock(session.endedAt, true)}
                                            {" · "}
                                            {formatDuration(session.endedAt - session.startedAt)}
                                            {" · "}
                                            {session.lineCount} ln
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            <div className="lv-sidebar__foot">
                <span>
                    {loading
                        ? `Wczytywanie ${loading.done} z ${loading.total}...`
                        : narrowed
                          ? `${listed.filter(hasHits).length} z ${total} ${pluralSessions(total)}`
                          : shown === total
                            ? `${total} ${pluralSessions(total)}`
                            : `${shown} z ${total} ${pluralSessions(total)}`}
                </span>
                {searching && allScope ? (
                    <Button variant="link" size="sm" onClick={() => onShowAllChange(!showAll)}>
                        {showAll ? "Tylko z trafieniami" : "Pokaż wszystkie"}
                    </Button>
                ) : (
                    // A keyboard hint is noise on a touch screen, where the
                    // drawer is how you change session.
                    <span className="lv-row lv-row--tight lv-keys-only">
                        <Kbd>[</Kbd>
                        <Kbd>]</Kbd>
                        <span>zmiana</span>
                    </span>
                )}
            </div>
        </div>
    );
}
