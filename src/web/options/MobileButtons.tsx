import { useEffect, useRef, useState } from "react";
import { Button, Check, ColorInput, Field, Input, Segmented } from "@web-ui/primitives/index.ts";
import {
    applySettings,
    defaultButtonGap,
    defaultButtonSize,
    defaultSoloModes,
    loadSettings,
    saveSettings,
    withViews,
    type Settings,
} from "../mobileButtonSettings";
import { getTeamState } from "@modules/core/teamStateProvider";
import {
    getRegisteredButtonMacros,
    isButtonMacroAvailable,
    type PluginButtonMacro,
} from "@modules/core/pluginButtonMacroRegistry";
import eventBus from "@modules/core/eventBus";
import { BUTTON_MODES, PARENT_MODE, type ButtonMode, type ButtonModes } from "../mobileButtons/model";
import {
    hiddenIds,
    isOwnButton,
    ownCount,
    resolveBackground,
    resolveButton,
    resolveLayout,
    styleOf,
    styleUsage,
} from "../mobileButtons/resolve";
import {
    addLine,
    newStyleForButton,
    placeHidden,
    removeLine,
    restoreBackground,
    restoreButton,
    setBackground,
    setButton,
    setOwnLayout,
    swapSlots,
    updateStyle,
    type Edge,
    type OpResult,
} from "../mobileButtons/ops";
import type { StoredMobileButton } from "../mobileButtons/model";

import ButtonGrid from "./ButtonGrid";
import MacroSelect from "./MacroSelect";
import MacroConfigEditor from "./MacroConfigEditor";
import HoldConfig from "./HoldConfig";
import { SettingsValue } from "@web/settings/SettingsValue.tsx";

function clampAlpha(value: number) {
    if (Number.isNaN(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

function toHex(value: number) {
    const clamped = Math.min(255, Math.max(0, Math.round(value)));
    return clamped.toString(16).padStart(2, '0');
}

function parseBackgroundColor(value: string) {
    const fallback = { hex: '#87ceeb', alpha: 0.7 };
    if (!value) {
        return fallback;
    }
    const trimmed = value.trim();
    const hexMatch = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(trimmed);
    if (hexMatch) {
        const rgb = hexMatch[1];
        const alphaHex = hexMatch[2];
        const alpha = alphaHex ? parseInt(alphaHex, 16) / 255 : 1;
        return { hex: `#${rgb.toLowerCase()}`, alpha: clampAlpha(alpha) };
    }
    const rgbaMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i.exec(trimmed);
    if (rgbaMatch) {
        const [, r, g, b, a] = rgbaMatch;
        const hex = `#${toHex(parseInt(r, 10))}${toHex(parseInt(g, 10))}${toHex(parseInt(b, 10))}`;
        const alpha = a !== undefined ? clampAlpha(parseFloat(a)) : 1;
        return { hex, alpha };
    }
    return fallback;
}

function rgbaFromHexAlpha(hex: string, alpha: number) {
    const normalized = clampAlpha(alpha);
    const cleanHex = hex.replace('#', '');
    const r = parseInt(cleanHex.slice(0, 2), 16);
    const g = parseInt(cleanHex.slice(2, 4), 16);
    const b = parseInt(cleanHex.slice(4, 6), 16);
    const alphaRounded = Math.round(normalized * 100) / 100;
    return `rgba(${r}, ${g}, ${b}, ${alphaRounded})`;
}

const MODE_NAMES: Record<ButtonMode, string> = { solo: 'Solo', team: 'Drużyna', leader: 'Prowadzący' };
/** "z Solo", "z Drużyny", "z Prowadzącego". */
const MODE_FROM: Record<ButtonMode, string> = { solo: 'Solo', team: 'Drużyny', leader: 'Prowadzącego' };

type Tool = 'edit' | 'layout';

function plural(n: number, one: string, few: string, many: string) {
    if (n === 1) return one;
    const d = n % 10, h = n % 100;
    return d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
}

function modesOf(settings: Settings): ButtonModes {
    return { modes: settings.modes, styles: settings.styles, styleOrder: settings.styleOrder };
}

/**
 * The "Przyciski mobilne" settings page (docs/dev/MOBILE_BUTTONS_V2.md). Solo
 * is the base, Drużyna and Prowadzący show what they inherit and what they
 * change. Edits stay local until the settings dialog's Save runs the callback
 * given to `registerSave`; the dialog remounts the editor on open, which is
 * how unsaved edits are dropped.
 */
function MobileButtons({ registerSave }: { registerSave: (save: () => void) => void }) {
    const [stored] = useState(() => JSON.stringify(loadSettings()));
    const [settings, setSettings] = useState<Settings>(() => JSON.parse(stored));
    const [view, setView] = useState<ButtonMode>('solo');
    const [tool, setTool] = useState<Tool>('edit');
    const [selected, setSelected] = useState<string | null>(null);
    const [swapFrom, setSwapFrom] = useState<number | null>(null);
    const [styleEditorOpen, setStyleEditorOpen] = useState(false);
    const [notice, setNotice] = useState('');
    const noticeTimer = useRef<number | undefined>(undefined);
    const [pluginMacros, setPluginMacros] = useState<PluginButtonMacro[]>([]);

    useEffect(() => {
        registerSave(() => {
            // Untouched: leave storage (and the live buttons) alone.
            if (JSON.stringify(settings) === stored) return;
            // The radial menu and joysticks share this entry but have their own pages.
            const current = loadSettings();
            const next = { ...settings, radial: current.radial, joysticks: current.joysticks };
            saveSettings(next);
            const { isInAnyTeam, isLeader } = getTeamState();
            applySettings(next, isInAnyTeam, isLeader);
        });
    }, [registerSave, settings, stored]);

    useEffect(() => {
        setPluginMacros(getRegisteredButtonMacros());
        const handleMacrosChanged = () => setPluginMacros(getRegisteredButtonMacros());
        eventBus.on('pluginButtonMacrosChanged', handleMacrosChanged);
        return () => {
            eventBus.off('pluginButtonMacrosChanged', handleMacrosChanged);
        };
    }, []);

    useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

    function flash(message: string) {
        setNotice(message);
        window.clearTimeout(noticeTimer.current);
        noticeTimer.current = window.setTimeout(() => setNotice(''), 3000);
    }

    const data = modesOf(settings);
    const parent = PARENT_MODE[view];

    function commit(next: ButtonModes, message?: string) {
        setSettings(prev => withViews({ ...prev, modes: next.modes, styles: next.styles, styleOrder: next.styleOrder }));
        if (message) flash(message);
    }

    function commitButton(result: OpResult) {
        commit(result.data, result.forked ? `Nadpisano przycisk w trybie ${MODE_NAMES[view]}` : undefined);
    }

    function commitLayout(result: OpResult) {
        commit(result.data, result.forked ? `Utworzono własny układ dla trybu ${MODE_NAMES[view]}` : undefined);
    }

    function changeView(mode: ButtonMode) {
        setView(mode);
        setSwapFrom(null);
    }

    function changeTool(next: Tool) {
        setTool(next);
        setSwapFrom(null);
    }

    function onCellClick(id: string, index: number) {
        if (tool === 'edit') {
            setSelected(prev => (prev === id ? null : id));
            setStyleEditorOpen(false);
            return;
        }
        if (swapFrom === null) {
            setSwapFrom(index);
        } else {
            if (swapFrom !== index) commitLayout(swapSlots(data, view, swapFrom, index));
            setSwapFrom(null);
        }
    }

    function restoreDefaults() {
        if (view === 'solo') {
            const stock = defaultSoloModes(data);
            commit({
                modes: { ...data.modes, solo: stock.modes.solo },
                styles: { ...data.styles, ...stock.styles },
                styleOrder: [...new Set([...data.styleOrder, ...stock.styleOrder])],
            }, 'Przywrócono domyślny układ Solo');
        } else {
            commit({ ...data, modes: { ...data.modes, [view]: { buttons: {} } } }, `${MODE_NAMES[view]} znowu dziedziczy wszystko z ${MODE_FROM[parent!]}`);
        }
        setSelected(null);
    }

    const current = settings[view];
    const layoutSource = resolveLayout(data, view).source;
    const ownLayout = view !== 'solo' && layoutSource === view;
    const rows = Math.ceil(current.order.length / Math.max(1, current.cols));
    const own = ownCount(data, view);
    const chain: ButtonMode[] = [];
    for (let m: ButtonMode | null = view; m; m = PARENT_MODE[m]) chain.push(m);

    const editing = tool === 'edit' && !!selected && current.order.includes(selected);

    // On a phone the panel is under the grid: bring the selected button's settings into view.
    useEffect(() => {
        if (!editing || window.innerWidth >= 900) return;
        document.querySelector('.mobile-buttons-editor .mobile-button-config')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [editing, selected]);

    const buttonSize = settings.buttonSize ?? defaultButtonSize;
    const buttonGap = settings.buttonGap ?? defaultButtonGap;

    const cellState = (id: string, index: number) => {
        const resolved = resolveButton(data, view, id);
        return {
            inherited: view !== 'solo' && !!resolved && resolved.source !== view && resolved.button.macroType !== 'empty',
            own: isOwnButton(data, view, id),
            selected: tool === 'edit' && selected === id,
            swapSource: tool === 'layout' && swapFrom === index,
        };
    };

    const edgeButton = (label: string, title: string, onClick: () => void) => (
        <Button size="sm" variant="ghost" className="popup-btn--icon" title={title} onClick={onClick}>{label}</Button>
    );
    const edge = (sign: '+' | '-', where: Edge) => {
        const line = where === 'top' || where === 'bottom' ? 'wiersz' : 'kolumnę';
        const place = { top: 'u góry', bottom: 'na dole', left: 'z lewej', right: 'z prawej' }[where];
        return sign === '+'
            ? edgeButton('+', `Dodaj ${line} ${place}`, () => commitLayout(addLine(data, view, where)))
            : edgeButton('-', `Usuń ${line} ${place}`, () => commitLayout(removeLine(data, view, where)));
    };

    const grid = (
        <ButtonGrid
            id={`mobile-buttons-preview-${view}`}
            layout={current}
            buttonSize={buttonSize}
            buttonGap={buttonGap}
            cellState={cellState}
            onCellClick={onCellClick}
        />
    );

    return (
        <>
            <SettingsValue value={settings} />
            <div className="mobile-buttons-editor" data-settings-ignore>
                <div className="mobile-buttons-top-row">
                    <div className="dialog-tabs">
                        {BUTTON_MODES.map(mode => {
                            const count = ownCount(data, mode);
                            return (
                                <button
                                    key={mode}
                                    type="button"
                                    className={`dialog-tab${view === mode ? ' is-active' : ''}`}
                                    onClick={() => changeView(mode)}
                                >
                                    {MODE_NAMES[mode]}
                                    {count > 0 && <span className="dialog-tab__count" title="Własne przyciski">{count}</span>}
                                </button>
                            );
                        })}
                    </div>
                    <div className="popup-inline">
                        <Button size="sm" onClick={() => eventBus.emit('mobileButtonsResetPosition')}>
                            Resetuj pozycje
                        </Button>
                        <Check
                            id="mobile-buttons-lock"
                            label="Zablokuj"
                            checked={settings.locked}
                            onChange={e => setSettings(prev => ({ ...prev, locked: e.target.checked }))}
                        />
                    </div>
                </div>

                <div className="mobile-buttons-chain">
                    <span>
                        {chain.map((m, i) => (
                            <span key={m}>
                                {i > 0 && <span className="mobile-buttons-chain__arrow"> ← </span>}
                                <span className={i === 0 ? 'mobile-buttons-chain__current' : undefined}>{MODE_NAMES[m]}</span>
                            </span>
                        ))}
                    </span>
                    <span className="mobile-buttons-chain__summary">
                        {view === 'solo'
                            ? 'baza dla pozostałych trybów'
                            : `${own} ${plural(own, 'własny', 'własne', 'własnych')} · układ ${ownLayout ? `własny ${current.cols}×${rows}` : `z ${MODE_FROM[layoutSource]}`}`}
                    </span>
                </div>

                <div className={`mobile-buttons-stage${editing ? ' is-editing' : ''}`}>
                    <Segmented
                        value={tool}
                        onChange={changeTool}
                        options={[{ value: 'edit', label: 'Edytuj' }, { value: 'layout', label: 'Układ' }]}
                    />
                    {tool === 'layout' ? (
                        <div className="mobile-buttons-grid-editor">
                            <div className="mobile-buttons-grid-editor__edge">{edge('+', 'top')}{edge('-', 'top')}</div>
                            <div className="mobile-buttons-grid-editor__middle">
                                <div className="mobile-buttons-grid-editor__edge mobile-buttons-grid-editor__edge--side">{edge('+', 'left')}{edge('-', 'left')}</div>
                                {grid}
                                <div className="mobile-buttons-grid-editor__edge mobile-buttons-grid-editor__edge--side">{edge('+', 'right')}{edge('-', 'right')}</div>
                            </div>
                            <div className="mobile-buttons-grid-editor__edge">{edge('+', 'bottom')}{edge('-', 'bottom')}</div>
                        </div>
                    ) : (
                        <div className="mobile-buttons-grid-editor">{grid}</div>
                    )}
                </div>

                <div className="mobile-buttons-panel">
                    {notice && <div className="mobile-buttons-notice">{notice}</div>}
                    {tool === 'edit'
                        ? <EditPanel
                            data={data}
                            settings={settings}
                            view={view}
                            selected={selected && current.order.includes(selected) ? selected : null}
                            pluginMacros={pluginMacros}
                            styleEditorOpen={styleEditorOpen}
                            setStyleEditorOpen={setStyleEditorOpen}
                            onClose={() => setSelected(null)}
                            onChange={(id, patch) => commitButton(setButton(data, view, id, patch))}
                            onRestore={id => commit(restoreButton(data, view, id), `Przywrócono przycisk z ${MODE_FROM[parent!]}`)}
                            onGoTo={mode => changeView(mode)}
                            onNewStyle={id => {
                                const result = newStyleForButton(data, view, id);
                                commit(result.data, `Nowy styl „${result.data.styles[result.styleId].name}” dla tego przycisku`);
                                setStyleEditorOpen(true);
                            }}
                            onStyleChange={(styleId, patch) => commit(updateStyle(data, styleId, patch))}
                        />
                        : <LayoutPanel
                            data={data}
                            view={view}
                            ownLayout={ownLayout}
                            swapping={swapFrom !== null}
                            onOwnLayout={ownValue => {
                                commit(setOwnLayout(data, view, ownValue), ownValue
                                    ? `Utworzono własny układ dla trybu ${MODE_NAMES[view]}`
                                    : `Układ znowu dziedziczony z ${MODE_FROM[parent!]}`);
                                setSwapFrom(null);
                            }}
                            onPlace={id => commitLayout(placeHidden(data, view, id))}
                            onBackground={value => {
                                const result = setBackground(data, view, value);
                                commit(result.data, result.forked ? `Własne tło w trybie ${MODE_NAMES[view]}` : undefined);
                            }}
                            onRestoreBackground={() => commit(restoreBackground(data, view), `Tło znowu dziedziczone z ${MODE_FROM[parent!]}`)}
                        />}

                    <div className="mobile-buttons-background-section">
                        <span className="mobile-buttons-section-title">Wspólne dla wszystkich trybów</span>
                        <div className="mobile-buttons-slider-row">
                            <span className="popup-field__label">Rozmiar przycisku</span>
                            <input
                                type="range"
                                className="popup-range"
                                min={20}
                                max={80}
                                value={buttonSize}
                                onChange={e => setSettings(prev => ({ ...prev, buttonSize: Number(e.target.value) }))}
                            />
                            <span className="mobile-buttons-background-alpha-value">{buttonSize}px</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                title="Przywróć domyślne"
                                data-testid="reset-button-size"
                                onClick={() => setSettings(prev => ({ ...prev, buttonSize: defaultButtonSize }))}
                            >
                                ↺
                            </Button>
                        </div>
                        <div className="mobile-buttons-slider-row">
                            <span className="popup-field__label">Odstęp</span>
                            <input
                                type="range"
                                className="popup-range"
                                min={0}
                                max={20}
                                value={buttonGap}
                                onChange={e => setSettings(prev => ({ ...prev, buttonGap: Number(e.target.value) }))}
                            />
                            <span className="mobile-buttons-background-alpha-value">{buttonGap}px</span>
                            <Button
                                size="sm"
                                variant="ghost"
                                title="Przywróć domyślne"
                                data-testid="reset-button-gap"
                                onClick={() => setSettings(prev => ({ ...prev, buttonGap: defaultButtonGap }))}
                            >
                                ↺
                            </Button>
                        </div>
                    </div>
                </div>

                <div className="popup-inline settings-wrap mobile-buttons-footer">
                    <Button size="sm" onClick={restoreDefaults}>
                        {view === 'solo' ? 'Domyślne' : 'Dziedzicz wszystko'}
                    </Button>
                </div>
            </div>
        </>
    );
}

interface EditPanelProps {
    data: ButtonModes;
    settings: Settings;
    view: ButtonMode;
    selected: string | null;
    pluginMacros: PluginButtonMacro[];
    styleEditorOpen: boolean;
    setStyleEditorOpen: (open: boolean) => void;
    onClose: () => void;
    onChange: (id: string, patch: Partial<StoredMobileButton>) => void;
    onRestore: (id: string) => void;
    onGoTo: (mode: ButtonMode) => void;
    onNewStyle: (id: string) => void;
    onStyleChange: (styleId: string, patch: { name?: string; color?: string; fontColor?: string; activeColor?: string }) => void;
}

function EditPanel({
    data, settings, view, selected, pluginMacros, styleEditorOpen, setStyleEditorOpen,
    onClose, onChange, onRestore, onGoTo, onNewStyle, onStyleChange,
}: EditPanelProps) {
    const parent = PARENT_MODE[view];
    if (!selected) {
        return (
            <div className="mobile-buttons-hint">
                <p>Kliknij przycisk na podglądzie, aby go edytować. Puste pole to miejsce na nowy przycisk.</p>
                {view === 'solo'
                    ? <p><b>Solo to baza.</b> Drużyna dziedziczy z Solo, Prowadzący z Drużyny. Zmiana tutaj pojawia się wszędzie, gdzie przycisk nie jest nadpisany.</p>
                    : <>
                        <p><span className="mobile-buttons-own-dot" /> własny w trybie {MODE_NAMES[view]}; przygaszony — dziedziczony z {MODE_FROM[parent!]}.</p>
                        <p>Edycja dziedziczonego przycisku tworzy nadpisanie tylko w tym trybie.</p>
                    </>}
            </div>
        );
    }

    const resolved = resolveButton(data, view, selected);
    const button: StoredMobileButton = resolved?.button ?? { macroType: 'empty', label: '' };
    const filled = button.macroType !== 'empty';
    const fromParent = parent ? resolveButton(data, parent, selected) : null;
    const isInherited = view !== 'solo' && !!resolved && resolved.source !== view;
    const isOverride = view !== 'solo' && resolved?.source === view && !!fromParent;
    const isLocal = view !== 'solo' && !isInherited && !fromParent;
    const overriddenIn = (['team', 'leader'] as const).filter(m => isOwnButton(data, m, selected)).map(m => MODE_NAMES[m]);
    const style = filled ? styleOf(data, button) : null;
    const styleId = style ? data.styleOrder.find(id => data.styles[id] === style) ?? null : null;
    const usage = styleId ? styleUsage(data, view, styleId) : 0;
    const isDirection = button.macroType === 'kierunek' || button.macroType === 'specialExit';
    const asSetting = settings[view].buttons[selected];

    const colorRow = (label: string, value: string, onValue: (v: string) => void) => (
        <div className="mobile-button-color-row">
            <span className="popup-field__label">{label}</span>
            <ColorInput value={parseBackgroundColor(value).hex} onChange={onValue} />
        </div>
    );

    return (
        <div className="mobile-button-config">
            <div className="mobile-button-config-header">
                <h6 className="mobile-button-config-header-title">{filled ? `Przycisk „${button.label}”` : 'Puste pole'}</h6>
                <button type="button" className="popup-dialog__close mobile-button-config__close" title="Zamknij" onClick={onClose}>×</button>
            </div>
            <div className="mobile-button-config-body">
                <div className={`mobile-button-origin${isOverride || isLocal ? ' is-own' : ''}`}>
                    <div className="mobile-button-origin__text">
                        {view === 'solo' && <>
                            <b>Przycisk bazowy</b>
                            <span>{overriddenIn.length ? `Nadpisany w: ${overriddenIn.join(', ')}. Pozostałe tryby dziedziczą zmiany.` : 'Drużyna i Prowadzący dziedziczą go bez zmian.'}</span>
                        </>}
                        {isInherited && <>
                            <b>Dziedziczony z {MODE_FROM[resolved!.source]}</b>
                            <span>Zmiana utworzy nadpisanie w trybie {MODE_NAMES[view]}.</span>
                        </>}
                        {isOverride && <>
                            <b>Własny w trybie {MODE_NAMES[view]}</b>
                            <span>Zastępuje przycisk z {MODE_FROM[fromParent!.source]}.</span>
                        </>}
                        {isLocal && <>
                            <b>Tylko w trybie {MODE_NAMES[view]}</b>
                            <span>Pole z własnego układu, nie ma go w {MODE_FROM[parent!]}.</span>
                        </>}
                    </div>
                    {isInherited && <Button size="sm" onClick={() => onGoTo(resolved!.source)}>Edytuj w {MODE_FROM[resolved!.source]}</Button>}
                    {isOverride && <Button size="sm" onClick={() => onRestore(selected)}>Przywróć</Button>}
                </div>

                <div className="mobile-button-config-section">
                    <Field
                        label="Makro"
                        error={isButtonMacroAvailable(button.macroType) ? undefined : "Ta wtyczka nie jest załadowana. Makro nie będzie działać."}
                    >
                        <MacroSelect
                            value={button.macroType}
                            onChange={value => onChange(selected, { macroType: value })}
                            pluginMacros={pluginMacros}
                            showUnavailableWarning
                            className="mobile-button-macro"
                        />
                    </Field>
                    {filled && (
                        <Field label="Etykieta">
                            <Input
                                className="mobile-button-label"
                                value={button.label}
                                onChange={e => onChange(selected, { label: e.target.value })}
                            />
                        </Field>
                    )}
                    {filled && (
                        <MacroConfigEditor
                            config={button}
                            onChange={updates => onChange(selected, updates)}
                            pluginMacros={pluginMacros}
                            buttonColor={asSetting?.color}
                        />
                    )}
                </div>

                {filled && styleId && (
                    <div className="mobile-button-config-section">
                        <div className="mobile-button-config-section-title">Styl</div>
                        <div className="mobile-button-styles">
                            {data.styleOrder.map(id => (
                                <button
                                    key={id}
                                    type="button"
                                    className={`popup-chip mobile-button-style${id === styleId ? ' is-active' : ''}`}
                                    onClick={() => onChange(selected, { style: id })}
                                >
                                    <span className="mobile-button-style__swatch" style={{ backgroundColor: data.styles[id].color }} />
                                    {data.styles[id].name}
                                </button>
                            ))}
                            <button type="button" className="popup-chip mobile-button-style mobile-button-style--new" onClick={() => onNewStyle(selected)}>
                                + Nowy styl
                            </button>
                        </div>
                        <Button size="sm" variant="ghost" className="mobile-button-style-toggle" onClick={() => setStyleEditorOpen(!styleEditorOpen)}>
                            {styleEditorOpen ? 'Zwiń kolory stylu' : 'Zmień kolory stylu ›'}
                        </Button>
                        {styleEditorOpen && (
                            <div className="mobile-button-style-editor">
                                <Field label="Nazwa stylu">
                                    <Input value={style!.name} onChange={e => onStyleChange(styleId, { name: e.target.value })} />
                                </Field>
                                {colorRow('Tło', style!.color, v => onStyleChange(styleId, { color: v }))}
                                {colorRow('Tekst', style!.fontColor, v => onStyleChange(styleId, { fontColor: v }))}
                                {isDirection && colorRow('Aktywny (kierunek dostępny)', style!.activeColor, v => onStyleChange(styleId, { activeColor: v }))}
                                <p className={`mobile-button-style-usage${usage > 1 ? ' is-shared' : ''}`}>
                                    {usage > 1
                                        ? `Ten styl ma ${usage} ${plural(usage, 'przycisk', 'przyciski', 'przycisków')} w trybie ${MODE_NAMES[view]}, zmiana obejmie wszystkie. Żeby zmienić tylko ten, użyj „+ Nowy styl”.`
                                        : 'Tylko ten przycisk używa tego stylu.'}
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {filled && (
                    <HoldConfig
                        holdEnabled={button.holdEnabled || false}
                        hold={button.hold}
                        onToggle={enabled => onChange(selected, { holdEnabled: enabled })}
                        onChangeHold={hold => onChange(selected, { hold })}
                        pluginMacros={pluginMacros}
                        locked={settings.locked}
                        idSuffix={selected}
                    />
                )}
            </div>
        </div>
    );
}

interface LayoutPanelProps {
    data: ButtonModes;
    view: ButtonMode;
    ownLayout: boolean;
    swapping: boolean;
    onOwnLayout: (own: boolean) => void;
    onPlace: (id: string) => void;
    onBackground: (value: string) => void;
    onRestoreBackground: () => void;
}

function LayoutPanel({ data, view, ownLayout, swapping, onOwnLayout, onPlace, onBackground, onRestoreBackground }: LayoutPanelProps) {
    const parent = PARENT_MODE[view];
    const hidden = hiddenIds(data, view);
    const { background, source: backgroundSource } = resolveBackground(data, view);
    const { hex, alpha } = parseBackgroundColor(background);
    const ownBackground = view !== 'solo' && backgroundSource === view;
    const layoutFrom = resolveLayout(data, view).source;

    return (
        <div className="mobile-buttons-layout-panel">
            {parent ? (
                <div className="mobile-buttons-layout-source">
                    <Segmented
                        size="sm"
                        value={ownLayout ? 'own' : 'inherit'}
                        onChange={value => onOwnLayout(value === 'own')}
                        options={[{ value: 'inherit', label: `Z ${MODE_FROM[parent]}` }, { value: 'own', label: 'Własny' }]}
                    />
                    <p className="mobile-buttons-note">
                        {ownLayout
                            ? `Własny układ. Przyciski nadal dziedziczą treść i styl z ${MODE_FROM[parent]}, własne jest tylko rozmieszczenie.`
                            : `Zmiany układu w ${MODE_NAMES[layoutFrom]} pojawią się tutaj. Każda zmiana układu tutaj utworzy własny.`}
                    </p>
                </div>
            ) : (
                <p className="mobile-buttons-note">
                    Układ bazowy. {(['team', 'leader'] as const).map(m => `${MODE_NAMES[m]}: ${data.modes[m].layout ? 'własny' : 'dziedziczy'}`).join(', ')}.
                </p>
            )}

            <p className={`mobile-buttons-note mobile-buttons-swap-hint${swapping ? ' is-active' : ''}`}>
                {swapping
                    ? 'Wybrano pole. Kliknij drugie, aby je zamienić (albo to samo, aby anulować).'
                    : 'Kliknij dwa pola na podglądzie, aby zamienić je miejscami. Plus i minus na krawędziach dodają i usuwają wiersze i kolumny.'}
            </p>

            {hidden.length > 0 && (
                <div className="mobile-button-config-section">
                    <div className="mobile-button-config-section-title">Poza układem — kliknij, aby wstawić</div>
                    <div className="mobile-button-styles">
                        {hidden.map(id => {
                            const resolved = resolveButton(data, view, id)!;
                            const style = styleOf(data, resolved.button);
                            return (
                                <button key={id} type="button" className="popup-chip mobile-button-style" onClick={() => onPlace(id)}>
                                    <span className="mobile-button-style__swatch" style={{ backgroundColor: style.color }} />
                                    {resolved.button.label || id}
                                    <span className="mobile-buttons-note">z {MODE_FROM[resolved.source]}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className={`mobile-button-config-section${ownBackground ? ' is-own' : ''}`}>
                <div className="mobile-button-config-section-title">Tło panelu</div>
                <p className="mobile-buttons-note">
                    {view === 'solo'
                        ? 'Baza: tryby bez własnego tła dziedziczą je stąd.'
                        : ownBackground ? `Własne w trybie ${MODE_NAMES[view]}.` : `Dziedziczone z ${MODE_FROM[backgroundSource]}, zmiana utworzy własne.`}
                </p>
                <div className="mobile-buttons-slider-row">
                    <span className="popup-field__label">Kolor tła</span>
                    <div className="popup-inline">
                        <ColorInput value={hex} onChange={v => onBackground(rgbaFromHexAlpha(v, alpha))} />
                        <input
                            type="range"
                            className="popup-range"
                            title="Krycie tła"
                            min={0}
                            max={100}
                            value={Math.round(alpha * 100)}
                            onChange={e => onBackground(rgbaFromHexAlpha(hex, Number(e.target.value) / 100))}
                        />
                    </div>
                    <span className="mobile-buttons-background-alpha-value">{Math.round(alpha * 100)}%</span>
                    {ownBackground
                        ? <Button size="sm" variant="ghost" title={`Przywróć tło z ${MODE_FROM[parent!]}`} onClick={onRestoreBackground}>↺</Button>
                        : <span />}
                </div>
            </div>
        </div>
    );
}

export default MobileButtons;
