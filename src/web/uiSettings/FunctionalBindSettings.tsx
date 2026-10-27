import type { UiSettings } from '@shared/uiSettingsTypes.ts';
import { defaultRenderSettings } from '@shared/settingsDefaults.ts';
import { functionalBindParts, normalizeFunctionalBindPresentation } from '@shared/functionalBindPresentation.ts';
import { Button, Field, Input } from '@web-ui/primitives/index.ts';
import { CheckboxRow, ColorField, SelectField, SettingsSection } from './fields';

export default function FunctionalBindSettings({ draft, update }: {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}) {
    const settings = normalizeFunctionalBindPresentation(draft);
    return (
        <SettingsSection title="Bind funkcyjny">
            <SelectField id="ui-functional-bind-output" label="Komunikat w oknie gry" value={settings.functionalBindOutput}
                onChange={value => update({ functionalBindOutput: value as UiSettings['functionalBindOutput'] })}>
                <option value="full">Pełny — z odstępami (domyślny)</option>
                <option value="compact">Kompaktowy — jedna linia</option>
                <option value="hidden">Ukryty</option>
            </SelectField>
            <CheckboxRow id="ui-functional-bind-footer" label="Pokazuj aktywny bind w stopce"
                hint="Akcja wykonywana przez bind funkcyjny. Kliknięcie działa tak samo jak naciśnięcie klawisza."
                checked={settings.functionalBindInFooter} onChange={functionalBindInFooter => update({ functionalBindInFooter })} />
            <Field label="Format komunikatu" htmlFor="ui-functional-bind-template"
                hint="{key} — klawisz, {action} — klikalna akcja. Np. [{key}] {action}.">
                <Input id="ui-functional-bind-template" mono value={draft.functionalBindTemplate}
                    onChange={event => update({ functionalBindTemplate: event.target.value })} />
            </Field>
            <ColorField id="ui-functional-bind-color" label="Kolor tekstu" value={settings.functionalBindColor}
                onChange={functionalBindColor => update({ functionalBindColor })} />
            <ColorField id="ui-functional-bind-key-color" label="Kolor klawisza" value={settings.functionalBindKeyColor}
                onChange={functionalBindKeyColor => update({ functionalBindKeyColor })} />
            <CheckboxRow id="ui-functional-bind-action-default" label="Akcja w zwykłym kolorze tekstu gry"
                checked={!settings.functionalBindActionColor}
                onChange={normal => update({ functionalBindActionColor: normal ? '' : '#a0a0a0' })} />
            {settings.functionalBindActionColor && <ColorField id="ui-functional-bind-action-color" label="Kolor akcji"
                value={settings.functionalBindActionColor} onChange={functionalBindActionColor => update({ functionalBindActionColor })} />}
            <Field label="Podgląd komunikatu">
                {settings.functionalBindOutput === 'hidden' ? <span className="popup-field__hint">Komunikat w oknie gry jest ukryty.</span> : (
                    <div style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', background: draft.outputBackground,
                        color: settings.functionalBindActionColor || draft.outputTextColor || '#d3d3d3', padding: settings.functionalBindOutput === 'full' ? '1em' : '0.25em' }}>
                        {settings.functionalBindOutput === 'full' && '\t'}
                        {functionalBindParts(']', 'otworz skrzynie', settings).map((part, index) =>
                            <span key={index} style={{ color: part.color || undefined, textDecoration: part.action ? 'underline' : undefined }}>{part.text}</span>)}
                    </div>
                )}
            </Field>
            <div className="popup-inline">
                <Button size="sm" variant="ghost" onClick={() => update({
                    functionalBindOutput: 'compact', functionalBindTemplate: '[{key}] {action}',
                    functionalBindColor: '#808080', functionalBindKeyColor: '#a0a0a0',
                    functionalBindActionColor: '#a0a0a0', functionalBindInFooter: true,
                })}>Subtelny + stopka</Button>
                <Button size="sm" variant="ghost" onClick={() => update(normalizeFunctionalBindPresentation(defaultRenderSettings))}>
                    Przywróć domyślny
                </Button>
            </div>
        </SettingsSection>
    );
}
