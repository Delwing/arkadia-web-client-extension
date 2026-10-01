import { Badge, Button, Icon, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator } from "../ui";
import { charactersLabel } from "../model/characters";
import { formatClock, formatDuration, pluralLines } from "../model/format";
import type { LogSessionInfo } from "../model/types";

export interface ViewerHeaderProps {
    /** Undefined when the store is empty — the header still renders. */
    session: LogSessionInfo | undefined;
    /** Shown on the drawer button, so the count is visible before opening it. */
    sessionCount: number;
    /** Opens the session list while it is a drawer; hidden once it is docked. */
    onToggleSessions: () => void;
    onPrevSession: () => void;
    onNextSession: () => void;
    hasPrev: boolean;
    hasNext: boolean;
    onCopyView: () => void;
    onExportText: () => void;
    onExportHtml: () => void;
    onDownloadImage: () => void;
    onCopyImage: () => void;
    /** True while an image is rendering — the canvas work is not instant. */
    busy?: boolean;
    /** Labels say "zakres" when only a slice of the session is in view. */
    ranged: boolean;
    /**
     * The host's own entries, at the end of the copy-and-save menu — the
     * client's "open in a new tab", which the standalone page has no use for.
     */
    menuExtra?: React.ReactNode;
    /** Rendered at the far right — the dialog's close control, when there is one. */
    trailing?: React.ReactNode;
}

export function ViewerHeader({
    session,
    sessionCount,
    onToggleSessions,
    onPrevSession,
    onNextSession,
    hasPrev,
    hasNext,
    onCopyView,
    onExportText,
    onExportHtml,
    onDownloadImage,
    onCopyImage,
    busy,
    ranged,
    menuExtra,
    trailing,
}: ViewerHeaderProps) {
    const meta = session
        ? [
              session.dateLabel,
              `${formatClock(session.startedAt, true)}–${session.live ? "teraz" : formatClock(session.endedAt, true)}`,
              formatDuration(session.endedAt - session.startedAt),
              `${session.lineCount} ${pluralLines(session.lineCount)}`,
              session.file,
          ].join("  ·  ")
        : "Nie ma jeszcze żadnego logu";

    return (
        <div className="lv__header">
            {/* Only while the sidebar is a drawer — see `logViewer.css`. */}
            <IconButton
                className="lv-only-drawer"
                title={`Lista sesji (${sessionCount})`}
                onClick={onToggleSessions}
            >
                <Icon name="sessions" />
            </IconButton>

            <div className="lv-row lv-row--tight lv-hide-narrow">
                <IconButton title="Poprzednia sesja  [" onClick={onPrevSession} disabled={!hasPrev}>
                    <Icon name="chevron-left" />
                </IconButton>
                <IconButton title="Następna sesja  ]" onClick={onNextSession} disabled={!hasNext}>
                    <Icon name="chevron-right" />
                </IconButton>
            </div>

            <div className="lv__title-block">
                <div className="lv-row">
                    <h2 className="lv__title">
                        {session ? charactersLabel(session.characters, session.dateLabel) : "Logi"}
                    </h2>
                    {session?.live ? (
                        <>
                            <Badge tone="success" status dot="live" className="lv-hide-narrow">
                                Nagrywanie
                            </Badge>
                            {/* 110px of pill is more than a phone header can
                                spare; the dot says the same thing. */}
                            <span
                                className="lv-session__live lv-only-narrow"
                                title="Nagrywanie"
                            />
                        </>
                    ) : null}
                </div>
                <div className="lv__meta">{meta}</div>
            </div>

            {/* Copying and every export in one menu. They used to be two
                buttons plus an icon from the host, on a header that also
                carries the session's name — the one thing it is for. On a
                phone the label goes and the icon stays. */}
            <Menu
                disabled={busy || !session}
                trigger={
                    <Button
                        size="sm"
                        icon={<Icon name="export" size={14} />}
                        trailing={<Icon name="chevron-down" size={14} />}
                        disabled={busy || !session}
                        title="Kopiowanie i eksport"
                    >
                        <span className="lv-hide-narrow">{busy ? "Zapisywanie..." : "Kopiuj / zapisz"}</span>
                    </Button>
                }
            >
                <MenuItem onSelect={onCopyView}>Kopiuj widok</MenuItem>
                <MenuSeparator />
                <MenuLabel>{ranged ? "Zaznaczony zakres" : "Cały log"}</MenuLabel>
                <MenuItem onSelect={onExportHtml}>Pobierz HTML</MenuItem>
                <MenuItem onSelect={onExportText}>Pobierz tekst (.txt)</MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={onDownloadImage}>Pobierz jako obraz</MenuItem>
                <MenuItem onSelect={onCopyImage}>Kopiuj jako obraz</MenuItem>
                {menuExtra ? (
                    <>
                        <MenuSeparator />
                        {menuExtra}
                    </>
                ) : null}
            </Menu>

            {trailing ? (
                <div className="lv-row lv-row--tight">
                    <div className="lv-divider--vertical lv-hide-narrow" />
                    {trailing}
                </div>
            ) : null}
        </div>
    );
}
