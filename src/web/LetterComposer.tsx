import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PencilRuler } from 'lucide-react';
import eventBus from '@modules/core/eventBus';
import { useDraggablePopup } from './hooks/useDraggablePopup';
import {
    CUSTOM_LETTER_TEMPLATE_PREFIX,
    LETTER_TEMPLATE_CHOICES,
    LETTER_TEMPLATE_DEFINITIONS,
    type CustomLetterTemplate,
    type LetterTemplateId,
} from "@client/types/letter";
import { MAX_LINE_WIDTH, MIN_LINE_WIDTH, clampLineWidth, renderLetterLayout } from "@shared/letterRenderer";
import {
    listLetterTemplateChoices,
    loadCustomLetterTemplates,
    onCustomLetterTemplatesChange,
    resolveLetterTemplate,
} from "@modules/core/letterTemplates";
import { characterStorage } from "@modules/core/storage";
import { defaultSettings } from "@modules/core/defaultSettings";
import LetterTemplatesDialog from "./LetterTemplatesDialog";

const TEMPLATE_STORAGE_KEY = "letter-composer-template";
const WIDE_SCREEN_THRESHOLD = 900;

function isSelectableTemplate(value: unknown, customTemplates: readonly CustomLetterTemplate[]): value is LetterTemplateId {
    const resolved = resolveLetterTemplate(value, customTemplates);
    if (!resolved) {
        return false;
    }
    const builtin = LETTER_TEMPLATE_DEFINITIONS[resolved.value as keyof typeof LETTER_TEMPLATE_DEFINITIONS];
    return !builtin || builtin.supportsJustification;
}

function loadTemplateSelection(customTemplates: readonly CustomLetterTemplate[] = loadCustomLetterTemplates()): LetterTemplateId {
    try {
        const stored = localStorage.getItem(TEMPLATE_STORAGE_KEY);
        if (isSelectableTemplate(stored, customTemplates)) {
            return stored;
        }
    } catch {
        // ignore storage errors
    }
    return LETTER_TEMPLATE_CHOICES[0]?.value ?? "plain";
}

/** The default line width from settings; each letter can override it. */
function loadLineWidth(): number {
    const width = characterStorage.get("settings")?.letterLineWidth;
    return clampLineWidth(typeof width === "number" && Number.isFinite(width) ? width : defaultSettings.letterLineWidth);
}

function saveTemplateSelection(value: LetterTemplateId) {
    try {
        localStorage.setItem(TEMPLATE_STORAGE_KEY, value);
    } catch {
        // ignore storage errors
    }
}

const LetterComposer: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [isPinned, setIsPinned] = useState(false);
    const [customTemplates, setCustomTemplates] = useState<CustomLetterTemplate[]>(loadCustomLetterTemplates);
    const [templateSelection, setTemplateSelection] = useState<LetterTemplateId>(() => loadTemplateSelection());
    const [lineWidthInput, setLineWidthInput] = useState(() => String(loadLineWidth()));
    const lineWidth = useMemo(() => {
        const parsed = parseInt(lineWidthInput, 10);
        return Number.isFinite(parsed) ? clampLineWidth(parsed) : loadLineWidth();
    }, [lineWidthInput]);
    const [templatesDialogOpen, setTemplatesDialogOpen] = useState(false);
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
        // The templates dialog lives outside the panel: clicks and Escape there must not close the composer
        isPinned: isPinned || templatesDialogOpen,
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
        const template = templateSelectRef.current && isSelectableTemplate(templateSelectRef.current.value, customTemplates)
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
            lineWidth,
        };
    }, [templateSelection, customTemplates, lineWidth]);

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

    const selectTemplate = useCallback((value: LetterTemplateId) => {
        setTemplateSelection(value);
        saveTemplateSelection(value);
    }, []);

    const handleTemplateChange = useCallback(() => {
        if (templateSelectRef.current && isSelectableTemplate(templateSelectRef.current.value, customTemplates)) {
            selectTemplate(templateSelectRef.current.value);
        }
    }, [customTemplates, selectTemplate]);

    // Keep the template list in step with edits (also from other tabs and sync)
    useEffect(() => onCustomLetterTemplatesChange((templates) => {
        setCustomTemplates(templates);
        setTemplateSelection((current) => (isSelectableTemplate(current, templates) ? current : loadTemplateSelection(templates)));
    }), []);

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
            const templates = loadCustomLetterTemplates();
            setCustomTemplates(templates);
            setTemplateSelection(loadTemplateSelection(templates));
            setLineWidthInput(String(loadLineWidth()));
            setTemplatesDialogOpen(false);
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
        if (templateSelectRef.current && isSelectableTemplate(templateSelection, customTemplates)) {
            templateSelectRef.current.value = templateSelection;
        }
    }, [templateSelection, isOpen, customTemplates]);

    const resolvedTemplate = useMemo(
        () => resolveLetterTemplate(templateSelection, customTemplates) ?? resolveLetterTemplate("plain")!,
        [templateSelection, customTemplates],
    );
    const templateChoices = useMemo(() => listLetterTemplateChoices(customTemplates), [customTemplates]);

    // Compute rendered preview
    const previewLines = useMemo(() => {
        if (!isWideScreen || !contentText.trim()) {
            return null;
        }
        const result = renderLetterLayout(contentText, resolvedTemplate.layout, lineWidth);
        return result.lines;
    }, [contentText, resolvedTemplate, lineWidth, isWideScreen]);

    const templateLabel = resolvedTemplate.label;

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
                        <button type="button" className="panel-button panel-button--close" onClick={close} title="Zamknij" />
                    </div>
                </div>
                <div className="window-body letter-composer-body">
                    <form className="letter-composer-form" onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
                        <div className="letter-composer-field">
                            <label htmlFor="letter-to" className="popup-field__label">Do:</label>
                            <input
                                ref={toInputRef}
                                id="letter-to"
                                name="letter-to"
                                className="popup-input popup-input--control"
                                type="text"
                                autoComplete="off"
                                tabIndex={1}
                            />
                        </div>
                        <div className="letter-composer-field">
                            <label htmlFor="letter-dw" className="popup-field__label">DW:</label>
                            <input
                                ref={dwInputRef}
                                id="letter-dw"
                                name="letter-dw"
                                className="popup-input popup-input--control"
                                type="text"
                                autoComplete="off"
                                tabIndex={4}
                            />
                        </div>
                        <div className="letter-composer-field">
                            <label htmlFor="letter-udw" className="popup-field__label">UDW:</label>
                            <input
                                ref={udwInputRef}
                                id="letter-udw"
                                name="letter-udw"
                                className="popup-input popup-input--control"
                                type="text"
                                autoComplete="off"
                                tabIndex={5}
                            />
                        </div>
                        <div className="letter-composer-field">
                            <label htmlFor="letter-subject" className="popup-field__label">Temat:</label>
                            <input
                                ref={subjectInputRef}
                                id="letter-subject"
                                name="letter-subject"
                                className="popup-input popup-input--control"
                                type="text"
                                autoComplete="off"
                                tabIndex={2}
                            />
                        </div>
                        <div className="letter-composer-field letter-composer-field--grow">
                            <label htmlFor="letter-content" className="popup-field__label">Tresc:</label>
                            <textarea
                                ref={contentInputRef}
                                id="letter-content"
                                name="letter-content"
                                className="popup-input popup-input--control"
                                onChange={handleContentChange}
                                tabIndex={3}
                            />
                        </div>
                        <div className="letter-composer-actions">
                            <div className="letter-composer-options">
                                <div className="letter-template-group">
                                    <label htmlFor="letter-template" className="popup-field__label letter-template-label">Szablon:</label>
                                    <select
                                        ref={templateSelectRef}
                                        id="letter-template"
                                        name="letter-template"
                                        className="popup-input popup-input--control letter-template-select"
                                        defaultValue={templateSelection}
                                        onChange={handleTemplateChange}
                                    >
                                        {templateChoices.filter((choice) => !choice.custom).map((choice) => (
                                            <option key={choice.value} value={choice.value}>
                                                {choice.label}
                                            </option>
                                        ))}
                                        {customTemplates.length > 0 && (
                                            <optgroup label="Wlasne">
                                                {templateChoices.filter((choice) => choice.custom).map((choice) => (
                                                    <option key={choice.value} value={choice.value}>
                                                        {choice.label}
                                                    </option>
                                                ))}
                                            </optgroup>
                                        )}
                                    </select>
                                    <button
                                        type="button"
                                        className="popup-btn popup-btn--control popup-btn--icon letter-templates-open"
                                        onClick={() => setTemplatesDialogOpen(true)}
                                        title="Wlasne szablony listow"
                                    >
                                        <PencilRuler size={16} strokeWidth={1.75} />
                                    </button>
                                </div>
                                <div className="letter-template-group letter-width-group">
                                    <label htmlFor="letter-width" className="popup-field__label letter-template-label">Szerokosc:</label>
                                    <input
                                        id="letter-width"
                                        name="letter-width"
                                        type="number"
                                        min={MIN_LINE_WIDTH}
                                        max={MAX_LINE_WIDTH}
                                        className="popup-input popup-input--control letter-width-input"
                                        value={lineWidthInput}
                                        onChange={(ev) => setLineWidthInput(ev.target.value)}
                                        onBlur={() => setLineWidthInput(String(lineWidth))}
                                        title="Szerokosc linii tego listu (domyslna w ustawieniach)"
                                    />
                                </div>
                            </div>
                            <div className="letter-composer-buttons">
                                <button type="button" className="popup-btn popup-btn--control popup-btn--sm" onClick={handlePreview}>
                                    Podglad
                                </button>
                                <button type="submit" className="popup-btn popup-btn--control popup-btn--sm popup-btn--solid">Wyslij</button>
                            </div>
                        </div>
                    </form>
                    {isWideScreen && (
                        <div className="letter-composer-preview">
                            <div className="letter-composer-preview-header">
                                Podglad ({templateLabel}, szerokosc {lineWidth})
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
                {templatesDialogOpen && createPortal(
                    // Portaled: the composer's transform would pin the fixed backdrop to the panel
                    <div className="letter-templates-layer">
                        <LetterTemplatesDialog
                            lineWidth={lineWidth}
                            initialId={templateSelection.startsWith(CUSTOM_LETTER_TEMPLATE_PREFIX)
                                ? templateSelection.slice(CUSTOM_LETTER_TEMPLATE_PREFIX.length)
                                : undefined}
                            onAdded={selectTemplate}
                            onClose={() => setTemplatesDialogOpen(false)}
                        />
                    </div>,
                    document.body,
                )}
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
