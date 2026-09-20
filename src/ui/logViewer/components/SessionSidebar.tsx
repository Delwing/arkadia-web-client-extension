import { Badge, Field, Input, Kbd } from "../ui";
import { charactersLabel } from "../model/characters";
import { formatClock, formatDuration, pluralSessions } from "../model/format";
import type { LogSession } from "../model/types";

interface SessionGroup {
    label: string;
    sessions: LogSession[];
}

function groupByDay(sessions: LogSession[]): SessionGroup[] {
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
    sessions: LogSession[];
    visibleSessions: LogSession[];
    selectedId: string;
    filter: string;
    onFilterChange: (value: string) => void;
    onSelect: (id: string) => void;
    hitsBySession: Record<string, number>;
    /** True while a query is active — drives whether badges show at all. */
    searching: boolean;
    /** In All-logs scope every session shows its hit count, not just the open one. */
    allScope: boolean;
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
}: SessionSidebarProps) {
    const groups = groupByDay(visibleSessions);
    const total = sessions.length;
    const shown = visibleSessions.length;

    return (
        <div className="lv-sidebar">
            <div className="lv-sidebar__head">
                <Field label="Sesje" eyebrow htmlFor="lv-session-filter">
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
                {groups.length === 0 ? (
                    <div className="lv-sidebar__group">
                        {total === 0 ? "Brak zapisanych sesji." : "Brak sesji pasujacych do filtra."}
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
                                            {session.lines.length} ln
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
                    {shown === total ? `${total} ${pluralSessions(total)}` : `${shown} z ${total} ${pluralSessions(total)}`}
                </span>
                <span className="lv-row lv-row--tight">
                    <Kbd>[</Kbd>
                    <Kbd>]</Kbd>
                    <span>zmiana</span>
                </span>
            </div>
        </div>
    );
}
