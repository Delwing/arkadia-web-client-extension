import { useCallback, useEffect, useRef, useState } from 'react';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { useAutoScroll } from './hooks/useAutoScroll';
import type { ValidationResult } from '@modules/core/assistant/proposalValidator.ts';
import { askAssistant, statusMessage, type AssistantEvent } from './assistant/assistantClient';
import ProposalCard from './assistant/ProposalCard';
import PanelHintCard from './assistant/PanelHintCard';
import { detectPanelHint, type PanelHint } from './assistant/detectPanelHint';
import { loadKnowledgeBundle } from './assistant/knowledgeBundleClient';
import AssistantSettingsDialog from './assistant/AssistantSettingsDialog';

/**
 * The in-client AI assistant.
 *
 * A standard dockable popup rather than a settings modal: that buys docking,
 * floating, pinning, locking and detaching into a separate OS window for free
 * (every popup owning a portal target is detachable), and a single
 * `POPUP_CATALOG` entry mounts it in both the stock UI and forge.
 *
 * Nothing here writes to storage. The panel renders proposal cards; only a
 * click on "Zastosuj" reaches `applyProposal`.
 */
const POPUP_ID = 'popup:assistant';

interface AssistantMessage {
    id: number;
    role: 'user' | 'assistant' | 'system';
    text: string;
    /** Validated proposals attached to an assistant turn. */
    results?: ValidationResult[];
    /** Settings key each result concerned; needed for rejected ones. */
    settingKeys?: (string | undefined)[];
    /** Panel the answer pointed at, recognised from its prose. */
    panelHint?: PanelHint | null;
    /** True when the turn ended in a terminal error. */
    failed?: boolean;
    /** True while deltas are still arriving. */
    streaming?: boolean;
}

let nextId = 1;

const WELCOME = [
    'Zapytaj o cokolwiek zwiazanego z klientem Arkadii - ustawienia, aliasy, triggery, bindy.',
    'Jesli odpowiedz zawiera konkretna zmiane, dostaniesz karte z przyciskiem "Zastosuj".',
    'Nic nie zostanie zapisane, dopoki sam tego nie klikniesz.',
].join(' ');

export default function AssistantPopup() {
    const [messages, setMessages] = useState<AssistantMessage[]>([]);
    const [input, setInput] = useState('');
    const [busy, setBusy] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    /** Question handed in by the open event, asked once the panel is up. */
    const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

    const abortRef = useRef<AbortController | null>(null);

    // Stable identity: usePopup's subscribe effect depends on it, and a new
    // function every render would re-subscribe on every keystroke.
    const handleOpenEvent = useCallback((data: { question?: string; seedTriggerText?: string } | void) => {
        if (!data) return;
        if (data.question) {
            setPendingQuestion(data.question);
            return;
        }
        if (data.seedTriggerText) {
            const lines = data.seedTriggerText.split('\n').map(line => line.trim()).filter(Boolean);
            setInput(`Zrob trigger na taka linie z gry:\n${lines.join('\n')}`);
        }
    }, []);

    const { wrapperProps } = usePopup(POPUP_ID, {
        openEvent: 'assistant.popup.open',
        onOpen: handleOpenEvent,
    });

    const { containerRef, handleScroll } = useAutoScroll({ deps: [messages] });

    const ask = useCallback((question: string) => {
        const trimmed = question.trim();
        if (!trimmed || abortRef.current) return;

        const answerId = nextId++;
        setMessages(prev => [
            ...prev,
            { id: nextId++, role: 'user', text: trimmed },
            { id: answerId, role: 'assistant', text: '', streaming: true },
        ]);
        setBusy(true);

        const controller = new AbortController();
        abortRef.current = controller;

        const patch = (fn: (message: AssistantMessage) => AssistantMessage) =>
            setMessages(prev => prev.map(message => (message.id === answerId ? fn(message) : message)));

        const onEvent = (event: AssistantEvent) => {
            switch (event.type) {
                case 'delta':
                    patch(message => ({ ...message, text: message.text + event.text }));
                    break;
                case 'restart':
                    // A provider died after already emitting text. Everything shown
                    // so far belongs to a dead answer and must go.
                    patch(message => ({ ...message, text: '' }));
                    break;
                case 'proposals':
                    patch(message => ({ ...message, results: event.results, settingKeys: event.settingKeys }));
                    break;
                case 'meta':
                    if (event.cached) {
                        patch(message => ({ ...message, text: message.text }));
                    }
                    break;
                case 'notice':
                    setMessages(prev => [...prev, { id: nextId++, role: 'system', text: event.message }]);
                    break;
                case 'error':
                    patch(message => ({
                        ...message,
                        failed: true,
                        streaming: false,
                        text: message.text
                            ? `${message.text}\n\n${event.message || statusMessage(event.status)}`
                            : (event.message || statusMessage(event.status)),
                    }));
                    break;
                case 'done':
                    patch(message => ({ ...message, streaming: false }));
                    // The answer often points at a panel instead of proposing a
                    // change. Recognise it so the user gets a button, not a
                    // menu path to follow by hand.
                    void loadKnowledgeBundle()
                        .then(bundle =>
                            patch(message => ({
                                ...message,
                                panelHint: message.text ? detectPanelHint(message.text, bundle) : null,
                            })),
                        )
                        .catch(() => {
                            /* No bundle: the answer's own text still names the panel. */
                        });
                    break;
            }
        };

        askAssistant({ question: trimmed, signal: controller.signal, onEvent })
            .catch((err: unknown) => {
                console.error('Blad asystenta', err);
                patch(message => ({
                    ...message,
                    failed: true,
                    text: message.text || statusMessage('internal_error'),
                }));
            })
            .finally(() => {
                abortRef.current = null;
                setBusy(false);
                patch(message => ({ ...message, streaming: false }));
            });
    }, []);

    // Questions arriving through `/pomoc <pytanie>` are asked immediately.
    useEffect(() => {
        if (pendingQuestion === null) return;
        setPendingQuestion(null);
        ask(pendingQuestion);
    }, [pendingQuestion, ask]);

    useEffect(() => () => abortRef.current?.abort(), []);

    const handleSubmit = (event: React.FormEvent) => {
        event.preventDefault();
        if (busy) return;
        const question = input;
        setInput('');
        ask(question);
    };

    const handleStop = () => {
        abortRef.current?.abort();
        abortRef.current = null;
        setBusy(false);
    };

    const headerActions = (
        <>
            <button
                type="button"
                className="assistant-header-btn"
                title="Wyczysc rozmowe"
                onClick={() => setMessages([])}
            >
                Wyczysc
            </button>
            <button
                type="button"
                className="assistant-header-btn"
                title="Ustawienia asystenta"
                onClick={() => setShowSettings(true)}
            >
                Ustawienia
            </button>
        </>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="assistant"
            title="Asystent"
            minWidth={380}
            minHeight={320}
            initialWidth={520}
            initialHeight={520}
            className="assistant-popup"
            bodyClassName="assistant-popup-body"
            headerActions={headerActions}
        >
            <div className="assistant-popup__messages" ref={containerRef} onScroll={handleScroll}>
                {messages.length === 0 && (
                    <div className="assistant-popup__empty">{WELCOME}</div>
                )}
                {messages.map(message => (
                    <div
                        key={message.id}
                        className={`assistant-msg assistant-msg--${message.role}${message.failed ? ' assistant-msg--failed' : ''}`}
                    >
                        {message.text && <div className="assistant-msg__text">{message.text}</div>}
                        {message.streaming && !message.text && (
                            <div className="assistant-msg__pending">Mysle...</div>
                        )}
                        {message.results?.map((result, index) => {
                            // A setting the assistant is not allowed to change is not a
                            // rejected proposal — the model found the right one and said
                            // so. Offer the panel instead of reporting a failure.
                            const key = panelHintKey(result, message.settingKeys?.[index]);
                            if (key) {
                                return (
                                    <PanelHintCard
                                        key={index}
                                        settingKey={key}
                                        message={errorMessage(result)}
                                    />
                                );
                            }
                            return <ProposalCard key={index} result={result} />;
                        })}
                        {/* The answer named a panel without proposing anything — the
                            usual case, since the bundle tells the model to point at
                            the panel for settings it may not author. Skipped when a
                            rejected proposal already produced a card for it. */}
                        {message.panelHint && !hasHintFor(message, message.panelHint.settingKey) && (
                            <PanelHintCard
                                settingKey={message.panelHint.settingKey}
                                label={message.panelHint.label}
                                uiLocation={message.panelHint.uiLocation}
                            />
                        )}
                        {message.results && rejected(message.results, message.settingKeys).length > 0 && (
                            <div className="assistant-msg__dropped">
                                Odrzucono {rejected(message.results, message.settingKeys).length} niepoprawnych
                                propozycji: {rejectionSummary(message.results, message.settingKeys)}
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <form className="assistant-popup__composer" onSubmit={handleSubmit}>
                <textarea
                    className="assistant-popup__input"
                    value={input}
                    rows={2}
                    placeholder="Zadaj pytanie po polsku..."
                    onChange={event => setInput(event.target.value)}
                    onKeyDown={event => {
                        if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            handleSubmit(event);
                        }
                    }}
                />
                {busy ? (
                    <button type="button" className="assistant-btn" onClick={handleStop}>Przerwij</button>
                ) : (
                    <button type="submit" className="assistant-btn assistant-btn--primary" disabled={!input.trim()}>
                        Zapytaj
                    </button>
                )}
            </form>

            {/* The placeholder disappears as soon as the user types, which is precisely
                when a follow-up gets written. This line stays put. */}
            <p className="assistant-popup__hint">
                Asystent nie pamieta poprzednich pytan - kazde musi byc samodzielne.
            </p>

            {showSettings && <AssistantSettingsDialog onClose={() => setShowSettings(false)} />}
        </DockablePopupWrapper>
    );
}

/** First failure reason of each rejected proposal, joined for one short line. */
/** The code for "a human must set this one in the panel", not a defect. */
const NOT_EDITABLE = 'settingNotAssistantEditable';

function isPanelHint(result: ValidationResult): boolean {
    return !result.ok && result.issues.some(issue => issue.code === NOT_EDITABLE);
}

/**
 * The settings key to offer a panel for, or undefined if this result is not a
 * panel hint. Requires the key: without it the button would have nowhere to go,
 * so the result falls back to being reported as a plain rejection.
 */
function panelHintKey(result: ValidationResult, settingKey: string | undefined): string | undefined {
    return isPanelHint(result) && settingKey ? settingKey : undefined;
}

/**
 * Whether a rejected proposal already produced a card for this key, so the
 * prose-derived hint does not render a duplicate beside it.
 */
function hasHintFor(message: AssistantMessage, settingKey: string): boolean {
    return (message.results ?? []).some(
        (result, index) => panelHintKey(result, message.settingKeys?.[index]) === settingKey,
    );
}

function errorMessage(result: ValidationResult): string {
    return result.issues.find(issue => issue.severity === 'error')?.message ?? 'nieznany blad';
}

/**
 * Genuine rejections only.
 *
 * Excludes exactly those results that got a `PanelHintCard` — keyed on the same
 * `panelHintKey` the render uses, so a hint we could not build a card for (no
 * settings key) still gets reported rather than disappearing from both places.
 */
function rejected(results: ValidationResult[], settingKeys?: (string | undefined)[]): ValidationResult[] {
    return results.filter(
        (result, index) => !result.ok && !panelHintKey(result, settingKeys?.[index]),
    );
}

function rejectionSummary(results: ValidationResult[], settingKeys?: (string | undefined)[]): string {
    return rejected(results, settingKeys).map(errorMessage).join(' ');
}
