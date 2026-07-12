import React, { useCallback, useEffect, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import type { LetterContent } from '@client/scripts/poczta';

const POPUP_ID = 'popup:letter-view';

const LetterViewPopup: React.FC = () => {
    const [letter, setLetter] = useState<LetterContent | null>(null);

    const { wrapperProps, setIsOpen } = usePopup(POPUP_ID);

    useEffect(() => {
        const handleLetterLoaded = (data: LetterContent) => {
            setLetter(data);
            setIsOpen(true);
        };

        return eventBus.on('poczta.letter.loaded', handleLetterLoaded);
    }, [setIsOpen]);

    const handleReply = useCallback(() => {
        if (!letter) return;
        const subject = letter.subject.startsWith('Odp: ') ? letter.subject : `Odp: ${letter.subject}`;
        eventBus.emit('letterComposer', {
            to: letter.from,
            subject,
        });
    }, [letter]);

    const handleForward = useCallback(() => {
        if (!letter) return;
        eventBus.emit('letterComposer', {
            subject: letter.subject,
            content: letter.body.join('\n'),
        });
    }, [letter]);

    const headerActions = letter ? (
        <div className="letter-view-actions">
            <button
                type="button"
                className="popup-btn"
                onClick={handleReply}
                title="Odpowiedz"
            >
                Odpowiedz
            </button>
            <button
                type="button"
                className="popup-btn"
                onClick={handleForward}
                title="Przekaz dalej"
            >
                Przekaz
            </button>
        </div>
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
            bodyClassName="letter-view-body"
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
