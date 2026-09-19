import { Badge, Button, Icon, IconButton } from "@design";
import { formatClock, formatDuration, pluralLines } from "../model/format";
import type { LogSession } from "../model/types";

export interface ViewerHeaderProps {
    session: LogSession;
    onPrevSession: () => void;
    onNextSession: () => void;
    hasPrev: boolean;
    hasNext: boolean;
    onCopyView: () => void;
    onExport: () => void;
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
    onExport,
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
                <Button
                    size="sm"
                    icon={<Icon name="export" size={14} />}
                    onClick={onExport}
                    title="Zapisz widoczne linie jako .txt"
                >
                    Eksport
                </Button>
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
