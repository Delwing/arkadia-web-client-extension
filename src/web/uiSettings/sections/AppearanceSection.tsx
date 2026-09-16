import { useEffect, useRef } from "react";
import type { UiSettings } from "../../uiSettingsCore";
import { guessFontFamilyFromStylesheet, guessFontFamilyFromUrl } from "../../uiSettingsCore";
import { computeAccentHex, generateRandomColor } from "../../themes/randomTheme";
import { defaultUiSettings } from "../../defaultUiSettings";
import { CheckboxRow, ColorField, DeviceOnlyBadge, NumberField, SelectField, SettingsSection } from "../fields";

interface AppearanceSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
    commitCustomDark: (color: string) => void;
}

function AppearanceSection({ draft, update, commitCustomDark }: AppearanceSectionProps) {
    const isCustomFont = draft.fontFamily === 'custom';
    const isCustomDark = draft.colorTheme === 'custom-dark';

    // Tracks whether the user has manually edited the custom font family,
    // so an automatic guess doesn't clobber a deliberate value.
    const customFontFamilyTouched = useRef(false);
    const lastAutomaticFontFamily = useRef('');

    // Seed "touched" state once based on the initial value vs. a URL-derived guess.
    useEffect(() => {
        const initial = draft.customFontFamily.trim();
        const guessFromUrl = draft.customFontUrl ? guessFontFamilyFromUrl(draft.customFontUrl) : undefined;
        if (initial) {
            if (guessFromUrl && guessFromUrl === initial) {
                lastAutomaticFontFamily.current = initial;
                customFontFamilyTouched.current = false;
            } else {
                customFontFamilyTouched.current = true;
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to seed refs
    }, []);

    // Debounced automatic font-family guess from the stylesheet URL.
    useEffect(() => {
        if (!isCustomFont) return;
        const href = draft.customFontUrl.trim();
        if (!/^https?:\/\//i.test(href)) return;
        if (customFontFamilyTouched.current) return;
        let cancelled = false;
        const t = setTimeout(async () => {
            const guess = await guessFontFamilyFromStylesheet(href);
            if (cancelled || !guess) return;
            if (customFontFamilyTouched.current) return;
            lastAutomaticFontFamily.current = guess;
            update({ customFontFamily: guess });
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- update is stable enough; guard via refs
    }, [isCustomFont, draft.customFontUrl]);

    const onCustomFontFamilyInput = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) {
            customFontFamilyTouched.current = false;
            lastAutomaticFontFamily.current = '';
        } else if (trimmed !== lastAutomaticFontFamily.current) {
            customFontFamilyTouched.current = true;
            lastAutomaticFontFamily.current = '';
        }
        update({ customFontFamily: value });
    };

    return (
        <SettingsSection title="Wygląd">
            <SelectField id="ui-font-family" label="Czcionka okna wyjścia i listy obiektów" value={draft.fontFamily} onChange={(v) => {
                update({ fontFamily: v as UiSettings['fontFamily'] });
                if (v !== 'custom') {
                    // Clearing automatic guess when leaving custom mode
                    if (!customFontFamilyTouched.current && draft.customFontFamily.trim() === lastAutomaticFontFamily.current) {
                        update({ customFontFamily: '' });
                    }
                    lastAutomaticFontFamily.current = '';
                }
            }}>
                <option value="default">Domyślna (systemowa monospace)</option>
                <option value="fira-code">Fira Code</option>
                <option value="jetbrains-mono">JetBrains Mono</option>
                <option value="cascadia-mono">Cascadia Mono</option>
                <option value="custom">Własna (link)</option>
            </SelectField>
            {isCustomFont && (
                <div id="ui-custom-font-settings" className="d-flex flex-column gap-2">
                    <div>
                        <label className="form-label" htmlFor="ui-custom-font-url">Adres arkusza czcionki</label>
                        <input id="ui-custom-font-url" type="url" className="form-control" placeholder="https://..." value={draft.customFontUrl} onChange={(e) => update({ customFontUrl: e.target.value })} />
                        <div className="form-text">Podaj adres arkusza stylów z definicją czcionki (np. Google Fonts).</div>
                    </div>
                    <div>
                        <label className="form-label" htmlFor="ui-custom-font-family">Nazwa rodziny czcionki</label>
                        <input id="ui-custom-font-family" type="text" className="form-control" placeholder="np. Roboto" value={draft.customFontFamily} onChange={(e) => onCustomFontFamilyInput(e.target.value)} />
                        <div className="form-text">Wpisz nazwę rodziny tak, jak w arkuszu (możesz dodać alternatywy po przecinku).</div>
                    </div>
                </div>
            )}
            <NumberField id="ui-content-font" label="Rozmiar czcionki treści (rem)" settingKey="contentFontSize" value={draft.contentFontSize} step={0.1} onChange={(n) => update({ contentFontSize: n })} />
            <NumberField id="ui-objects-font" label="Rozmiar czcionki listy obiektów (rem)" settingKey="objectsFontSize" value={draft.objectsFontSize} step={0.1} onChange={(n) => update({ objectsFontSize: n })} />
            <div>
                <label className="form-label" htmlFor="ui-objectlist-bg-color">Kolor tła listy obiektów<DeviceOnlyBadge settingKey="objectListBackgroundColor" /></label>
                <div className="d-flex align-items-center gap-2 flex-wrap">
                    <input id="ui-objectlist-bg-color" type="color" className="form-control form-control-color" value={draft.objectListBackgroundColor} onChange={(e) => update({ objectListBackgroundColor: e.target.value })} />
                    <label htmlFor="ui-objectlist-bg-alpha" className="form-label mb-0">Przezroczystość:</label>
                    <input id="ui-objectlist-bg-alpha" type="range" min={0} max={1} step={0.01} className="form-range" style={{ flex: '1 1 120px' }} value={draft.objectListBackgroundAlpha} onChange={(e) => update({ objectListBackgroundAlpha: parseFloat(e.target.value) })} />
                    <span id="ui-objectlist-bg-alpha-value" className="text-muted small" style={{ minWidth: '2.5rem' }}>{draft.objectListBackgroundAlpha}</span>
                    <button id="ui-objectlist-bg-reset" type="button" className="btn btn-outline-secondary btn-sm" onClick={() => update({ objectListBackgroundColor: defaultUiSettings.objectListBackgroundColor, objectListBackgroundAlpha: defaultUiSettings.objectListBackgroundAlpha })}>
                        Przywróć domyślny
                    </button>
                </div>
            </div>
            <ColorField id="ui-output-background" label="Kolor tła okna głównego" value={draft.outputBackground} onChange={(v) => update({ outputBackground: v })} onReset={() => update({ outputBackground: defaultUiSettings.outputBackground })} />
            <CheckboxRow id="ui-highlight-message-blocks" label="Wyróżniaj bloki wiadomości" checked={draft.highlightMessageBlocks} onChange={(v) => update({ highlightMessageBlocks: v })} />
            <SelectField id="ui-xterm-palette" label="Paleta kolorów" value={draft.xtermPalette} onChange={(v) => update({ xtermPalette: v as UiSettings['xtermPalette'] })}>
                <option value="arkadia">Arkadia</option>
                <option value="proper">XTerm</option>
            </SelectField>
            <div>
                <SelectField id="ui-color-theme" label="Motyw kolorystyczny" value={draft.colorTheme} onChange={(v) => update({ colorTheme: v as UiSettings['colorTheme'] })}>
                    <option value="default">Domyślny</option>
                    <option value="fantasy">Fantasy</option>
                    <option value="forest">Forest</option>
                    <option value="icy">Icy</option>
                    <option value="gray">Gray</option>
                    <option value="dark-neutral">Neutralny (ciemny)</option>
                    <option value="light-parchment">Pergamin (jasny)</option>
                    <option value="light-silver">Srebrny (jasny)</option>
                    <option value="custom-dark">Własny (ciemny)</option>
                </SelectField>
                {isCustomDark && (
                    <div id="ui-random-theme-controls" className="d-flex align-items-center gap-2 mt-2" data-settings-ignore>
                        <input id="ui-random-theme-color" type="color" className="form-control form-control-color" value={draft.customThemeColor ? computeAccentHex(draft.customThemeColor) : '#000000'} onChange={(e) => commitCustomDark(e.target.value)} />
                        <button id="ui-randomize-theme" type="button" className="btn btn-sm btn-outline-secondary" onClick={() => commitCustomDark(generateRandomColor())}>Losuj</button>
                    </div>
                )}
            </div>
        </SettingsSection>
    );
}

export default AppearanceSection;
