import React, { useCallback, useEffect, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { gmcp } from '@client/gmcp';
import type { LetterContent } from '@client/scripts/poczta';
import { HeaderButton } from '@web-ui/primitives';

const POPUP_ID = 'popup:letter-view';

/** How long "Usuń" stays armed waiting for the confirming second click. */
const CONFIRM_MS = 4000;

/** "Gertruda, Xerks i Vesper" - the game lists recipients the way it would say them. */
function splitNames(list: string): string[] {
    return list.split(/,\s*|\s+i\s+/).map(name => name.trim()).filter(Boolean);
}

const replySubject = (subject: string) => subject.startsWith('Odp: ') ? subject : `Odp: ${subject}`;

const LetterViewPopup: React.FC = () => {
    const [letter, setLetter] = useState<LetterContent | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { wrapperProps, setIsOpen } = usePopup(POPUP_ID);

    const disarmDelete = useCallback(() => {
        if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
        confirmTimer.current = null;
        setConfirmDelete(false);
    }, []);

    useEffect(() => {
        const handleLetterLoaded = (data: LetterContent) => {
            setLetter(data);
            disarmDelete();
            setIsOpen(true);
        };

        return eventBus.on('poczta.letter.loaded', handleLetterLoaded);
    }, [setIsOpen, disarmDelete]);

    useEffect(() => eventBus.on('poczta.deleted', ({ numbers }) => {
        if (letter && numbers.includes(letter.number)) {
            setLetter(null);
            setIsOpen(false);
        }
    }), [letter, setIsOpen]);

    useEffect(() => () => {
        if (confirmTimer.current !== null) clearTimeout(confirmTimer.current);
    }, []);

    const handleReply = useCallback(() => {
        if (!letter) return;
        eventBus.emit('letterComposer', {
            to: letter.from,
            subject: replySubject(letter.subject),
        });
    }, [letter]);

    const handleReplyAll = useCallback(() => {
        if (!letter) return;
        const self = gmcp.char?.info?.name?.toLowerCase();
        const seen = new Set<string>();
        const pick = (names: string[]) => names.filter(name => {
            const key = name.toLowerCase();
            if (key === self || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
        const to = pick([letter.from, ...splitNames(letter.to)]);
        const cc = pick(splitNames(letter.cc));
        eventBus.emit('letterComposer', {
            to: to.join(', '),
            cc: cc.length ? cc.join(', ') : undefined,
            subject: replySubject(letter.subject),
        });
    }, [letter]);

    const handleDelete = useCallback(() => {
        if (!letter) return;
        if (!confirmDelete) {
            setConfirmDelete(true);
            confirmTimer.current = setTimeout(() => setConfirmDelete(false), CONFIRM_MS);
            return;
        }
        disarmDelete();
        eventBus.emit('poczta.delete', { number: letter.number });
    }, [letter, confirmDelete, disarmDelete]);

    const handleForward = useCallback(() => {
        if (!letter) return;
        eventBus.emit('letterComposer', {
            subject: letter.subject,
            content: letter.body.join('\n'),
        });
    }, [letter]);

    const headerActions = letter ? (
        <>
            <HeaderButton onClick={handleReply} title="Odpowiedz">Odpowiedz</HeaderButton>
            <HeaderButton onClick={handleReplyAll} title="Odpowiedz nadawcy i wszystkim adresatom">Odpowiedz wszystkim</HeaderButton>
            <HeaderButton onClick={handleForward} title="Przekaż dalej">Przekaż</HeaderButton>
            <HeaderButton danger={confirmDelete} onClick={handleDelete} title="Usuń list">
                {confirmDelete ? 'Na pewno?' : 'Usuń'}
            </HeaderButton>
        </>
    ) : null;

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="letter-view"
            title={letter ? `List #${letter.number}: ${letter.subject}` : 'List'}
            minWidth={300}
            minHeight={200}
            initialWidth={500}
            initialHeight={350}
            className="letter-view-window"
            bodyClassName="popup-body"
            headerActions={headerActions}
        >
            {letter ? (
                <div className="letter-view-content">
                    <div className="letter-view-header">
                        <div className="letter-view-meta">
                            <span className="letter-view-label">Od:</span>
                            <span className="letter-view-value">{letter.from}</span>
                        </div>
                        {letter.to && (
                            <div className="letter-view-meta">
                                <span className="letter-view-label">Do:</span>
                                <span className="letter-view-value">{letter.to}</span>
                            </div>
                        )}
                        {letter.cc && (
                            <div className="letter-view-meta">
                                <span className="letter-view-label">DW:</span>
                                <span className="letter-view-value">{letter.cc}</span>
                            </div>
                        )}
                        <div className="letter-view-meta">
                            <span className="letter-view-label">Data:</span>
                            <span className="letter-view-value">{letter.date}</span>
                        </div>
                    </div>
                    <div className="letter-view-body-text">
                        {letter.body.map((line, index) => (
                            <div key={index} className="letter-view-line">{line || '\u00A0'}</div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="popup-empty">Brak listu.</div>
            )}
        </DockablePopupWrapper>
    );
};

export default LetterViewPopup;
