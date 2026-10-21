import { useEffect, useRef, useState } from "react";
import type { UiSettings } from "../../uiSettingsCore";
import { guessFontFamilyFromStylesheet, guessFontFamilyFromUrl } from "../../uiSettingsCore";
import { computeAccentHex, generateRandomColor } from "../../themes/randomTheme";
import { defaultUiSettings } from "../../defaultUiSettings";
import { Button, ColorInput, Field, Input, Select } from "@web-ui/primitives/index.ts";
import { CheckboxRow, ColorField, NumberField, RangeField, SelectField, SettingsSection } from "../fields";
import PalettePreviewDialog from "../PalettePreviewDialog";
import { SystemFontField, UploadedFontField } from "../FontSourceFields";
import { UploadedBackdropField } from "../BackdropField";
import { ensureFontLoaded, resolveOutputFontFamily, selectedFontName } from "../../fontLoader";

/** Faces the font dropdown can draw its own options in. */
const PREVIEWABLE_FONTS = ['fira-code', 'jetbrains-mono', 'cascadia-mono', 'vera-sans-mono'] as const;

/** The settings font, for options that name a source rather than a face. */
const UI_FONT = { fontFamily: "var(--font-ui, sans-serif)" };

/** CSS font stack a selection renders in; the default is plain monospace. */
function fontStack(selection: UiSettings['fontFamily'], familyName = ''): string {
    return resolveOutputFontFamily(selection, familyName) ?? 'monospace';
}

/** Root font size in px: the sizes are stored in rem and shown in px. */
function rootPx(): number {
    const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(px) && px > 0 ? px : 16;
}

/** A font size stored in rem, edited in pixels. */
function PxSizeField({ id, label, rem, onChange }: { id: string; label: string; rem: number; onChange: (rem: number) => void }) {
    const px = rootPx();
    return (
        <NumberField
            id={id}
            label={label}
            value={Math.round(rem * px * 10) / 10}
            step={1}
            min={4}
            onChange={(n) => onChange(Math.round((n / px) * 10000) / 10000)}
        />
    );
}

interface AppearanceSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
    commitCustomDark: (color: string) => void;
}

/** What the theme paints uncoloured game text in, for the picker while no colour of the player's own is set. */
function themeTextColor(): string {
    const output = document.getElementById('main_text_output_msg_wrapper');
    if (!output) return '#c0c0c0';
    // The live preview may still carry the colour just reset; look past it.
    const inline = output.style.color;
    output.style.removeProperty('color');
    const match = getComputedStyle(output).color.match(/\d+/g);
    output.style.color = inline;
    if (!match || match.length < 3) return '#c0c0c0';
    return '#' + match.slice(0, 3).map(n => Number(n).toString(16).padStart(2, '0')).join('');
}

function AppearanceSection({ draft, update, commitCustomDark }: AppearanceSectionProps) {
    const isCustomFont = draft.fontFamily === 'custom';
    const [palettePreview, setPalettePreview] = useState(false);
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

    // Load every built-in face so the dropdown can draw in it.
    useEffect(() => {
        for (const f of PREVIEWABLE_FONTS) ensureFontLoaded(f);
    }, []);
    useEffect(() => {
        if (isCustomFont) ensureFontLoaded('custom', draft.customFontUrl);
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
        <>
            <SettingsSection title="Motyw i kolory">
                <SelectField id="ui-color-theme" label="Motyw kolorystyczny" value={draft.colorTheme} onChange={(v) => update({ colorTheme: v as UiSettings['colorTheme'] })}>
                    <option value="default">Domyślny</option>
                    <option value="fantasy">Fantasy</option>
                    <option value="forest">Forest</option>
                    <option value="icy">Icy</option>
                    <option value="gray">Gray</option>
                    <option value="dark-neutral">Neutralny (ciemny)</option>
                    <option value="light-parchment">Pergamin (jasny)</option>
                    <option value="light-silver">Srebrny (jasny)</option>
                    <option value="forged">Forge</option>
                    <option value="custom-dark">Własny (ciemny)</option>
                </SelectField>
                {isCustomDark && (
                    <div id="ui-random-theme-controls" className="popup-inline" data-settings-ignore>
                        <ColorInput id="ui-random-theme-color" value={draft.customThemeColor ? computeAccentHex(draft.customThemeColor) : '#000000'} onChange={commitCustomDark} />
                        <Button id="ui-randomize-theme" size="sm" onClick={() => commitCustomDark(generateRandomColor())}>Losuj</Button>
                    </div>
                )}
                <Field label="Paleta kolorów" htmlFor="ui-xterm-palette">
                    <div className="popup-inline">
                        <Select
                            id="ui-xterm-palette"
                            className="settings-narrow"
                            value={draft.xtermPalette}
                            onChange={(e) => update({ xtermPalette: e.target.value as UiSettings['xtermPalette'] })}
                        >
                            <option value="arkadia">Arkadia</option>
                            <option value="proper">XTerm</option>
                        </Select>
                        <Button id="ui-xterm-palette-preview" size="sm" variant="ghost" onClick={() => setPalettePreview(true)}>Podgląd</Button>
                    </div>
                </Field>
                {palettePreview && (
                    <PalettePreviewDialog palette={draft.xtermPalette} onClose={() => setPalettePreview(false)} />
                )}
                <ColorField id="ui-output-background" label="Kolor tła okna głównego" value={draft.outputBackground} onChange={(v) => update({ outputBackground: v })} onReset={() => update({ outputBackground: defaultUiSettings.outputBackground })} />
                <ColorField
                    id="ui-output-text-color"
                    label="Domyślny kolor tekstu"
                    hint={draft.outputTextColor ? "Tekst bez własnego koloru ANSI." : "Tekst bez własnego koloru ANSI. Teraz z motywu."}
                    value={draft.outputTextColor ?? themeTextColor()}
                    onChange={(v) => update({ outputTextColor: v })}
                    onReset={() => update({ outputTextColor: undefined })}
                />
            </SettingsSection>
            <SettingsSection title="Czcionka">
                <SelectField id="ui-font-family" label="Okno wyjścia i lista obiektów" value={draft.fontFamily} style={{ fontFamily: fontStack(draft.fontFamily, selectedFontName(draft)) }} onChange={(v) => {
                    update({ fontFamily: v as UiSettings['fontFamily'] });
                    if (v !== 'custom') {
                        // Clearing automatic guess when leaving custom mode
                        if (!customFontFamilyTouched.current && draft.customFontFamily.trim() === lastAutomaticFontFamily.current) {
                            update({ customFontFamily: '' });
                        }
                        lastAutomaticFontFamily.current = '';
                    }
                }}>
                    <option value="default" style={{ fontFamily: fontStack('default') }}>Domyślna (systemowa monospace)</option>
                    <option value="fira-code" style={{ fontFamily: fontStack('fira-code') }}>Fira Code</option>
                    <option value="jetbrains-mono" style={{ fontFamily: fontStack('jetbrains-mono') }}>JetBrains Mono</option>
                    <option value="cascadia-mono" style={{ fontFamily: fontStack('cascadia-mono') }}>Cascadia Mono</option>
                    <option value="vera-sans-mono" style={{ fontFamily: fontStack('vera-sans-mono') }}>Bitstream Vera Sans Mono</option>
                    <option value="system" style={UI_FONT}>Zainstalowana w systemie</option>
                    <option value="uploaded" style={UI_FONT}>Wgrana z plików</option>
                    <option value="custom" style={UI_FONT}>Z linku (arkusz stylów)</option>
                </SelectField>
                {isCustomFont && (
                    <div id="ui-custom-font-settings" className="ui-settings-stack">
                        <Field label="Adres arkusza czcionki" htmlFor="ui-custom-font-url" hint="Podaj adres arkusza stylów z definicją czcionki (np. Google Fonts).">
                            <Input id="ui-custom-font-url" type="url" placeholder="https://..." value={draft.customFontUrl} onChange={(e) => update({ customFontUrl: e.target.value })} />
                        </Field>
                        <Field label="Nazwa rodziny czcionki" htmlFor="ui-custom-font-family" hint="Wpisz nazwę rodziny tak, jak w arkuszu (możesz dodać alternatywy po przecinku).">
                            <Input id="ui-custom-font-family" placeholder="np. Roboto" value={draft.customFontFamily} onChange={(e) => onCustomFontFamilyInput(e.target.value)} />
                        </Field>
                    </div>
                )}
                {draft.fontFamily === 'system' && (
                    <SystemFontField value={draft.systemFontFamily} onChange={(v) => update({ systemFontFamily: v })} />
                )}
                {draft.fontFamily === 'uploaded' && (
                    <UploadedFontField family={draft.uploadedFontFamily} onFamilyChange={(v) => update({ uploadedFontFamily: v })} />
                )}
                <PxSizeField id="ui-content-font" label="Rozmiar w oknie wyjścia (px)" rem={draft.contentFontSize} onChange={(n) => update({ contentFontSize: n })} />
                <PxSizeField id="ui-objects-font" label="Rozmiar na liście obiektów (px)" rem={draft.objectsFontSize} onChange={(n) => update({ objectsFontSize: n })} />
            </SettingsSection>
            <SettingsSection title="Obraz tła">
                <SelectField
                    id="ui-backdrop"
                    label="Obraz"
                    hint="Za całą stroną, pod tekstem gry."
                    value={draft.backgroundImage}
                    onChange={(v) => update({ backgroundImage: v as UiSettings['backgroundImage'] })}
                >
                    <option value="theme">Z motywu</option>
                    <option value="none">Brak</option>
                    <option value="uploaded">Własny</option>
                </SelectField>
                {draft.backgroundImage === 'uploaded' && <UploadedBackdropField />}
                {draft.backgroundImage !== 'none' && (
                    <RangeField id="ui-backdrop-shade" label="Przyciemnienie obrazu (%)" value={draft.backgroundImageShade} min={0} max={90} step={5} onChange={(n) => update({ backgroundImageShade: n })} />
                )}
            </SettingsSection>
            <SettingsSection title="Dodatki">
                <CheckboxRow id="ui-highlight-message-blocks" label="Wyróżniaj bloki wiadomości" hint="Ekwipunek, opisy postaci i łup dostają tło, pasek z boku i ikonę, by odróżniały się od reszty tekstu gry." checked={draft.highlightMessageBlocks} onChange={(v) => update({ highlightMessageBlocks: v })} />
                <CheckboxRow id="ui-character-plaque" label="Wizytówka postaci po zalogowaniu" checked={draft.characterPlaque} onChange={(v) => update({ characterPlaque: v })} />
            </SettingsSection>
        </>
    );
}

export default AppearanceSection;
