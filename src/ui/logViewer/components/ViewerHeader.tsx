import { Badge, Button, Icon, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator } from "../ui";
import { charactersLabel } from "../model/characters";
import { formatClock, formatDuration, pluralLines } from "../model/format";
import type { LogSession } from "../model/types";

export interface ViewerHeaderProps {
    /** Undefined when the store is empty — the header still renders. */
    session: LogSession | undefined;
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

    return (
        <div className="lv__header">
            <div className="lv-row lv-row--tight">
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

            <div className="lv-row lv-row--tight">
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
                    <MenuLabel>{ranged ? "Zaznaczony zakres" : "Caly log"}</MenuLabel>
                    <MenuItem onSelect={onExportHtml}>Pobierz HTML</MenuItem>
                    <MenuItem onSelect={onExportText}>Pobierz tekst (.txt)</MenuItem>
                    <MenuSeparator />
                    <MenuItem onSelect={onDownloadImage}>Pobierz jako obraz</MenuItem>
                    <MenuItem onSelect={onCopyImage}>Kopiuj jako obraz</MenuItem>
                </Menu>
                {trailing ? (
                    <>
                        <div className="lv-divider--vertical" />
                        {trailing}
                    </>
                ) : null}
            </div>
        </div>
    );
}
