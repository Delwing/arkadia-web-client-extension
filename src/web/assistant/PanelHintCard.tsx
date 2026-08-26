import { useEffect, useState } from 'react';
import { loadKnowledgeBundle } from './knowledgeBundleClient';
import { openSettingsFor } from './openSettings';

/**
 * "This one you set yourself — here's the button."
 *
 * Reached two ways, because the assistant has two ways of declining to change a
 * setting itself:
 *
 * 1. It named the panel in prose and proposed nothing. This is the common case
 *    and the one the knowledge bundle asks for; `detectPanelHint` recognises the
 *    navigation path in the answer and passes `label`/`uiLocation` straight in.
 * 2. It proposed the change anyway and the validator rejected it with
 *    `settingNotAssistantEditable`. Then only the key is known, and the rest is
 *    looked up from the bundle here.
 *
 * Either way the model is never asked to produce a "navigate" proposal, so there
 * is no new wire shape and nothing extra for a weak model to get wrong.
 */
export interface PanelHintCardProps {
    /** Registry-form key, e.g. `uiSettings.footerComponents`. */
    settingKey: string;
    /** Known when the hint came from the answer's prose. */
    label?: string;
    uiLocation?: string;
    /** The validator's explanation, shown while the bundle lookup is pending. */
    message?: string;
}

export default function PanelHintCard({ settingKey, label, uiLocation, message }: PanelHintCardProps) {
    const [resolved, setResolved] = useState<{ label: string; uiLocation: string } | null>(
        label && uiLocation ? { label, uiLocation } : null,
    );

    useEffect(() => {
        if (resolved) return;
        let live = true;
        loadKnowledgeBundle()
            .then(bundle => {
                if (!live) return;
                // The bundle keys settings by full path (`ui.uiSettings.footerComponents`)
                // while a proposal carries the registry form, so match on the suffix.
                const entry = bundle.settings.find(
                    s => s.path === settingKey || s.path.endsWith(`.${settingKey}`),
                );
                if (entry?.uiLocation) {
                    setResolved({ label: entry.label ?? settingKey, uiLocation: entry.uiLocation });
                }
            })
            .catch(() => {
                /* No bundle: the message alone still tells them what to do. */
            });
        return () => {
            live = false;
        };
    }, [settingKey, resolved]);

    return (
        <div className="assistant-card assistant-card--hint">
            <div className="assistant-card__title">Ustaw to samodzielnie</div>
            <div className="assistant-card__rows">
                <div className="assistant-card__row">
                    <span className="assistant-card__label">Ustawienie</span>
                    <span className="assistant-card__value">{resolved?.label ?? settingKey}</span>
                </div>
                {resolved && (
                    <div className="assistant-card__row">
                        <span className="assistant-card__label">Gdzie</span>
                        <span className="assistant-card__value">{resolved.uiLocation}</span>
                    </div>
                )}
            </div>
            {!resolved && message && <div className="assistant-card__note">{message}</div>}
            <div className="assistant-card__actions">
                <button
                    type="button"
                    className="assistant-btn assistant-btn--primary"
                    onClick={() => openSettingsFor(settingKey, resolved?.uiLocation)}
                >
                    Otworz ustawienia
                </button>
            </div>
        </div>
    );
}
