import type { UiSettings } from "../../uiSettingsCore";
import { defaultUiSettings } from "../../defaultUiSettings";
import BarOrderSettings from "../../options/BarOrderSettings";
import FooterComponentSettings from "../../options/FooterComponentSettings";
import { CheckboxRow, SelectField, SettingsSection } from "../fields";

interface FooterSectionsProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

function FooterSections({ draft, update }: FooterSectionsProps) {
    return (
        <>
            <SettingsSection title="Stan postaci">
                <SelectField id="ui-footer-mode" label="Tryb stopki" value={String(draft.footerMode)} onChange={(v) => update({ footerMode: parseInt(v, 10) })}>
                    <option value="4">Kafelki</option>
                    <option value="0">Liczbowy</option>
                    <option value="1">Pasek</option>
                    <option value="2">Pasek jednolity</option>
                    <option value="3">Pasek graficzny</option>
                </SelectField>
                <CheckboxRow id="ui-emoji-labels" label="Etykiety emoji" checked={draft.emojiLabels} onChange={(v) => update({ emojiLabels: v })} />
                <div className="popup-field">
                    <span className="popup-field__label">Kolejnosc i widocznosc paskow</span>
                    <div id="ui-bar-order-settings" className="settings-sort-block">
                        <BarOrderSettings
                            barOrder={draft.barOrder || defaultUiSettings.barOrder}
                            alwaysVisibleBars={draft.alwaysVisibleBars || []}
                            onChange={(barOrder, alwaysVisibleBars) => update({ barOrder, alwaysVisibleBars })}
                        />
                    </div>
                </div>
            </SettingsSection>

            <SettingsSection title="Stopka na telefonie">
                <p className="popup-field__hint">
                    Na waskim ekranie stopka zajmuje jedna linie o stalej wysokosci: dwa
                    pierwsze paski stanu i najpilniejsze plakietki. Przycisk po prawej rozwija
                    ja w panel ze wszystkimi paskami i plakietkami - a jesli stopka ma byc
                    zawsze rozwinieta albo zawsze zwinieta, przycisku nie ma wcale.
                </p>
                <CheckboxRow
                    id="ui-mobile-footer-compact"
                   
                    label="Kompaktowa stopka na telefonie"
                    checked={draft.mobileFooterCompact}
                    onChange={(v) => update({ mobileFooterCompact: v })}
                />
                <SelectField
                    id="ui-mobile-footer-expand"
                   
                    label="Rozwijanie stopki na telefonie"
                    value={draft.mobileFooterExpand}
                    disabled={!draft.mobileFooterCompact}
                    onChange={(v) => update({ mobileFooterExpand: v as UiSettings['mobileFooterExpand'] })}
                >
                    <option value="toggle">Zwinieta, z przyciskiem</option>
                    <option value="expanded">Zawsze rozwinieta</option>
                    <option value="collapsed">Zawsze zwinieta</option>
                </SelectField>
            </SettingsSection>

            <SettingsSection title="Elementy stopki">
                <div id="ui-footer-components-settings">
                    <FooterComponentSettings
                        components={draft.footerComponents}
                        onChange={(footerComponents) => update({ footerComponents })}
                    />
                </div>
            </SettingsSection>
        </>
    );
}

export default FooterSections;
