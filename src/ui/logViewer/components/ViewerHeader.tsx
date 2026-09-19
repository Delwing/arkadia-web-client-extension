import { Badge, Button, Icon, IconButton, Menu, MenuItem, MenuLabel, MenuSeparator } from "@design";
import { formatClock, formatDuration, pluralLines } from "../model/format";
import type { LogSession } from "../model/types";

export interface ViewerHeaderProps {
    session: LogSession;
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
    const meta = [
        session.dateLabel,
        `${formatClock(session.startedAt, true)}–${session.live ? "teraz" : formatClock(session.endedAt, true)}`,
        formatDuration(session.endedAt - session.startedAt),
        `${session.lines.length} ${pluralLines(session.lines.length)}`,
        session.file,
    ].join("  ·  ");

    return (
        <div className="ark-dialog-header">
            <div className="ark-row ark-row--tight">
                <IconButton title="Poprzednia sesja  [" onClick={onPrevSession} disabled={!hasPrev}>
                    <Icon name="chevron-left" />
                </IconButton>
                <IconButton title="Nastepna sesja  ]" onClick={onNextSession} disabled={!hasNext}>
                    <Icon name="chevron-right" />
                </IconButton>
            </div>

            <div className="lv__title-block">
                <div className="ark-row">
                    <h2 className="ark-dialog-title">{session.character}</h2>
                    {session.live ? (
                        <Badge tone="success" status dot="live">
                            Nagrywanie
                        </Badge>
                    ) : null}
                </div>
                <div className="lv__meta">{meta}</div>
            </div>

            <div className="ark-row ark-row--tight">
                <Button
                    size="sm"
                    icon={<Icon name="copy" size={14} />}
                    onClick={onCopyView}
                    title="Skopiuj linie widoczne na ekranie"
                >
                    Kopiuj widok
                </Button>
                <Menu
                    trigger={
                        <Button
                            size="sm"
                            icon={<Icon name="export" size={14} />}
                            trailing={<Icon name="chevron-down" size={14} />}
                            disabled={busy}
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
                        <div className="ark-divider ark-divider--vertical" />
                        {trailing}
                    </>
                ) : null}
            </div>
        </div>
    );
}
