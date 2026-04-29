import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { useDraggablePopup } from './hooks/useDraggablePopup';
import {
    LETTER_TEMPLATE_CHOICES,
    LETTER_TEMPLATE_DEFINITIONS,
    LETTER_TEMPLATE_PREVIEW_LABELS,
    isLetterTemplate,
    type LetterTemplate,
} from "@client/types/letter";
import { renderLetter } from "@shared/letterRenderer";

const TEMPLATE_STORAGE_KEY = "letter-composer-template";
const DEFAULT_LINE_WIDTH = 60;
const WIDE_SCREEN_THRESHOLD = 900;

function isSelectableTemplate(value: unknown): value is LetterTemplate {
    return isLetterTemplate(value) && Boolean(LETTER_TEMPLATE_DEFINITIONS[value]?.supportsJustification);
}

function loadTemplateSelection(): LetterTemplate {
    try {
        const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        if (isSelectableTemplate(stored)) {
            return stored;
        }
    } catch {
        // ignore storage errors
    }
    return LETTER_TEMPLATE_CHOICES[0]?.value ?? "plain";
}

function saveTemplateSelection(value: LetterTemplate) {
    try {
        localStorage.setItem(TEMPLATE_STORAGE_KEY, value);
    } catch {
        // ignore storage errors
    }
}

const LetterComposer: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isPinned, setIsPinned] = useState(false);
    const [templateSelection, setTemplateSelection] = useState<LetterTemplate>(loadTemplateSelection);
    const [contentText, setContentText] = useState("");
    const [isWideScreen, setIsWideScreen] = useState(false);

    const toInputRef = useRef<HTMLInputElement>(null);
    const dwInputRef = useRef<HTMLInputElement>(null);
    const udwInputRef = useRef<HTMLInputElement>(null);
    const subjectInputRef = useRef<HTMLInputElement>(null);
    const contentInputRef = useRef<HTMLTextAreaElement>(null);
    const templateSelectRef = useRef<HTMLSelectElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    const togglePinned = useCallback(() => {
        setIsPinned((prev) => !prev);
    }, []);

    const { panelRef, position, size, handlePointerDown, handleResizePointerDown } = useDraggablePopup({
        isOpen,
        isPinned,
        onClose: close,
        minWidth: 400,
        minHeight: 300,
    });

    // Check container width and update wide screen state
    useEffect(() => {
        if (!isOpen) return;

        const checkWidth = () => {
            const container = panelRef.current;
            if (container) {
                const width = size?.width ?? container.offsetWidth;
                setIsWideScreen(width >= WIDE_SCREEN_THRESHOLD);
            }
        };

        checkWidth();

        const resizeObserver = new ResizeObserver(checkWidth);
        if (panelRef.current) {
            resizeObserver.observe(panelRef.current);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [isOpen, size, panelRef]);

    const getPayload = useCallback(() => {
        const template = templateSelectRef.current && isSelectableTemplate(templateSelectRef.current.value)
            ? templateSelectRef.current.value
            : templateSelection;
        setTemplateSelection(template);
        saveTemplateSelection(template);
        return {
            to: toInputRef.current?.value ?? "",
            cc: dwInputRef.current?.value ?? "",
            udw: udwInputRef.current?.value ?? "",
            subject: subjectInputRef.current?.value ?? "",
            content: contentInputRef.current?.value ?? "",
            template,
        };
    }, [templateSelection]);

    const resetForm = useCallback(() => {
        if (toInputRef.current) toInputRef.current.value = "";
        if (dwInputRef.current) dwInputRef.current.value = "";
        if (udwInputRef.current) udwInputRef.current.value = "";
        if (subjectInputRef.current) subjectInputRef.current.value = "";
        if (contentInputRef.current) contentInputRef.current.value = "";
        setContentText("");
    }, []);

    const handleSubmit = useCallback((ev: React.FormEvent) => {
        ev.preventDefault();
        const payload = getPayload();
        eventBus.emit("letterComposer.submit", payload);
        close();
        resetForm();
    }, [getPayload, close, resetForm]);

    const handlePreview = useCallback((ev: React.MouseEvent) => {
        ev.preventDefault();
        const payload = getPayload();
        eventBus.emit("letterComposer.preview", payload);
    }, [getPayload]);

    const handleTemplateChange = useCallback(() => {
        if (templateSelectRef.current && isSelectableTemplate(templateSelectRef.current.value)) {
            const newTemplate = templateSelectRef.current.value;
            setTemplateSelection(newTemplate);
            saveTemplateSelection(newTemplate);
        }
    }, []);

    const handleContentChange = useCallback((ev: React.ChangeEvent<HTMLTextAreaElement>) => {
        setContentText(ev.target.value);
    }, []);

    const handleKeyDown = useCallback((ev: React.KeyboardEvent) => {
        if (ev.key === 'Enter' && ev.ctrlKey) {
            ev.preventDefault();
            ev.stopPropagation();
            const payload = getPayload();
            eventBus.emit("letterComposer.submit", payload);
            close();
            resetForm();
        }
    }, [getPayload, close, resetForm]);

    // Listen for open event
    useEffect(() => {
        const handleOpen = (payload?: { to?: string; cc?: string; udw?: string; subject?: string; content?: string }) => {
            const savedTemplate = loadTemplateSelection();
            setTemplateSelection(savedTemplate);
            resetForm();
            setIsOpen(true);
            requestAnimationFrame(() => {
                if (payload?.to && toInputRef.current) {
                    toInputRef.current.value = payload.to;
                }
                if (payload?.cc && dwInputRef.current) {
                    dwInputRef.current.value = payload.cc;
                }
                if (payload?.udw && udwInputRef.current) {
                    udwInputRef.current.value = payload.udw;
                }
                if (payload?.subject && subjectInputRef.current) {
                    subjectInputRef.current.value = payload.subject;
                }
                if (payload?.content && contentInputRef.current) {
                    contentInputRef.current.value = payload.content;
                    setContentText(payload.content);
                }
                toInputRef.current?.focus();
            });
        };

        eventBus.on("letterComposer", handleOpen);
        return () => {
            eventBus.off("letterComposer", handleOpen);
        };
    }, [resetForm]);

    // Apply template selection when it changes
    useEffect(() => {
        if (templateSelectRef.current && isSelectableTemplate(templateSelection)) {
            templateSelectRef.current.value = templateSelection;
        }
    }, [templateSelection, isOpen]);

    // Compute rendered preview
    const previewLines = useMemo(() => {
        if (!isWideScreen || !contentText.trim()) {
            return null;
        }
        const result = renderLetter(contentText, templateSelection, DEFAULT_LINE_WIDTH);
        return result.lines;
    }, [contentText, templateSelection, isWideScreen]);

    const templateLabel = LETTER_TEMPLATE_PREVIEW_LABELS[templateSelection] ?? templateSelection;

    if (!isOpen) {
        return null;
    }

    return (
        <div
            ref={panelRef}
            className={`floating-window letter-composer ${
                position ? 'floating-window--floating letter-composer--floating' : 'floating-window--center letter-composer--center'
            } ${isWideScreen ? 'letter-composer--wide' : ''}`}
            style={{
                ...(position ? { left: `${position.left}px`, top: `${position.top}px` } : {}),
                ...(size ? { width: `${size.width}px`, height: `${size.height}px` } : {})
            }}
        >
            <div className="floating-window__inner letter-composer-inner" ref={containerRef}>
                <div className="window-header letter-composer-header" onPointerDown={handlePointerDown}>
                    <span className="window-header__title">Nowy list</span>
                    <div
                        className="window-header__actions window-header-actions"
                        onPointerDownCapture={(event) => event.stopPropagation()}
                    >
                        <button
                            type="button"
                            className={`panel-button panel-button--pin window-pin-button${isPinned ? ' is-active window-pin-button--active' : ''}`}
                            onClick={togglePinned}
                            title={isPinned ? 'Odepnij okno' : 'Przypnij okno'}
                        />
                        <button type="button" className="panel-button panel-button--close btn-close btn-close-white" onClick={close} />
                    </div>
                </div>
                <div className="window-body letter-composer-body">
                    <form className="letter-composer-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
                        <div className="letter-composer-field">
                            <label htmlFor="letter-to" className="form-label">Do:</label>
                            <input
                                ref={toInputRef}
                                id="letter-to"
                                name="letter-to"
                                className="form-control form-control-sm"
                                type="text"
                                autoComplete="off"
                                tabIndex={1}
                            />
                        </div>
                        <div className="letter-composer-field">
                            <label htmlFor="letter-dw" className="form-label">DW:</label>
                            <input
                                ref={dwInputRef}
                                id="letter-dw"
                                name="letter-dw"
                                className="form-control form-control-sm"
                                type="text"
                                autoComplete="off"
                                tabIndex={4}
                            />
                        </div>
                        <div className="letter-composer-field">
                            <label htmlFor="letter-udw" className="form-label">UDW:</label>
                            <input
                                ref={udwInputRef}
                                id="letter-udw"
                                name="letter-udw"
                                className="form-control form-control-sm"
                                type="text"
                                autoComplete="off"
                                tabIndex={5}
                            />
                        </div>
                        <div className="letter-composer-field">
                            <label htmlFor="letter-subject" className="form-label">Temat:</label>
                            <input
                                ref={subjectInputRef}
                                id="letter-subject"
                                name="letter-subject"
                                className="form-control form-control-sm"
                                type="text"
                                autoComplete="off"
                                tabIndex={2}
                            />
                        </div>
                        <div className="letter-composer-field letter-composer-field--grow">
                            <label htmlFor="letter-content" className="form-label">Tresc:</label>
                            <textarea
                                ref={contentInputRef}
                                id="letter-content"
                                name="letter-content"
                                className="form-control"
                                onChange={handleContentChange}
                                tabIndex={3}
                            />
                        </div>
                        <div className="letter-composer-actions">
                            <div className="letter-template-group">
                                <label htmlFor="letter-template" className="form-label mb-0">Szablon:</label>
                                <select
                                    ref={templateSelectRef}
                                    id="letter-template"
                                    name="letter-template"
                                    className="form-select form-select-sm letter-template-select"
                                    defaultValue={templateSelection}
                                    onChange={handleTemplateChange}
                                >
                                    {LETTER_TEMPLATE_CHOICES.map((choice) => (
                                        <option key={choice.value} value={choice.value}>
                                            {choice.displayLabel}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <button type="button" className="btn btn-secondary btn-sm" onClick={handlePreview}>
                                Podglad
                            </button>
                            <button type="submit" className="btn btn-primary btn-sm">Wyslij</button>
                        </div>
                    </form>
                    {isWideScreen && (
                        <div className="letter-composer-preview">
                            <div className="letter-composer-preview-header">
                                Podglad ({templateLabel})
                            </div>
                            <div className="letter-composer-preview-content">
                                {previewLines ? (
                                    <pre className="letter-composer-preview-text">
                                        {previewLines.join('\n')}
                                    </pre>
                                ) : (
                                    <div className="letter-composer-preview-empty">
                                        Wpisz tresc listu, aby zobaczyc podglad
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div
                    className="resize-handle letter-composer-resize-handle"
                    onPointerDown={handleResizePointerDown}
                    title="Drag to resize"
                />
            </div>
        </div>
    );
};

export default LetterComposer;
