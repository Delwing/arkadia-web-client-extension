import { Badge, Button, Icon, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator } from "../ui";
import { charactersLabel } from "../model/characters";
import { formatClock, formatDuration, pluralLines } from "../model/format";
import type { LogSession } from "../model/types";

export interface ViewerHeaderProps {
    /** Undefined when the store is empty — the header still renders. */
    session: LogSession | undefined;
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
    trailing,
}: ViewerHeaderProps) {
    const meta = session
        ? [
              session.dateLabel,
              `${formatClock(session.startedAt, true)}–${session.live ? "teraz" : formatClock(session.endedAt, true)}`,
              formatDuration(session.endedAt - session.startedAt),
              `${session.lines.length} ${pluralLines(session.lines.length)}`,
              session.file,
          ].join("  ·  ")
        : "Nie ma jeszcze zadnego logu";

    const exportItems = (
        <>
            <MenuLabel>{ranged ? "Zaznaczony zakres" : "Caly log"}</MenuLabel>
            <MenuItem onSelect={onExportHtml}>Pobierz HTML</MenuItem>
            <MenuItem onSelect={onExportText}>Pobierz tekst (.txt)</MenuItem>
            <MenuSeparator />
            <MenuItem onSelect={onDownloadImage}>Pobierz jako obraz</MenuItem>
            <MenuItem onSelect={onCopyImage}>Kopiuj jako obraz</MenuItem>
        </>
    );

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
                <IconButton title="Nastepna sesja  ]" onClick={onNextSession} disabled={!hasNext}>
                    <Icon name="chevron-right" />
                </IconButton>
            </div>

            <div className="lv__title-block">
                <div className="lv-row">
                    <h2 className="lv__title">
                        {session ? charactersLabel(session.characters, session.dateLabel) : "Logi"}
                    </h2>
                    {session?.live ? (
                        <Badge tone="success" status dot="live">
                            Nagrywanie
                        </Badge>
                    ) : null}
                </div>
                <div className="lv__meta">{meta}</div>
            </div>

            {/* Wide enough for both controls: copying is one click away. */}
            <div className="lv-row lv-row--tight lv-hide-narrow">
                <Button
                    size="sm"
                    icon={<Icon name="copy" size={14} />}
                    onClick={onCopyView}
                    disabled={!session}
                    title="Skopiuj linie widoczne na ekranie"
                >
                    Kopiuj widok
                </Button>
                <Menu
                    disabled={busy || !session}
                    trigger={
                        <Button
                            size="sm"
                            icon={<Icon name="export" size={14} />}
                            trailing={<Icon name="chevron-down" size={14} />}
                            disabled={busy || !session}
                            title={ranged ? "Zapisz zaznaczony zakres" : "Zapisz caly log"}
                        >
                            {busy ? "Zapisywanie..." : ranged ? "Eksport zakresu" : "Eksport"}
                        </Button>
                    }
                >
                    {exportItems}
                </Menu>
            </div>

            {/* On a phone the same actions share one overflow menu. Shrinking
                the two buttons to their icons was not enough: a host adds its
                own controls here (the client adds three), and with those the
                row ran off the right edge of the screen. */}
            <div className="lv-only-narrow">
                <Menu
                    disabled={busy || !session}
                    trigger={
                        <IconButton
                            title={busy ? "Zapisywanie..." : "Kopiowanie i eksport"}
                            disabled={busy || !session}
                        >
                            <Icon name="more" />
                        </IconButton>
                    }
                >
                    <MenuItem onSelect={onCopyView}>Kopiuj widok</MenuItem>
                    <MenuSeparator />
                    {exportItems}
                </Menu>
            </div>

            {trailing ? (
                <div className="lv-row lv-row--tight">
                    <div className="lv-divider--vertical lv-hide-narrow" />
                    {trailing}
                </div>
            ) : null}
        </div>
    );
}
