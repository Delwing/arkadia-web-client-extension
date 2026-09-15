import type { UiSettings } from "../../uiSettingsCore";
import { defaultUiSettings } from "../../defaultUiSettings";
import BarOrderSettings from "../../options/BarOrderSettings";
import FooterComponentSettings from "../../options/FooterComponentSettings";
import { CheckboxRow, SelectField, SettingsSection } from "../fields";

interface FooterTabProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

function FooterTab({ draft, update }: FooterTabProps) {
    return (
        <>
            <SettingsSection title="Stan postaci">
                <SelectField id="ui-footer-mode" label="Tryb stopki" value={String(draft.footerMode)} onChange={(v) => update({ footerMode: parseInt(v) || 0 })}>
                    <option value="0">Liczbowy</option>
                    <option value="1">Pasek</option>
                    <option value="2">Pasek jednolity</option>
                    <option value="3">Pasek graficzny</option>
                </SelectField>
                <CheckboxRow id="ui-emoji-labels" label="Etykiety emoji" checked={draft.emojiLabels} onChange={(v) => update({ emojiLabels: v })} />
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
                <div className="form-text mt-0">
                    Na waskim ekranie stopka jest podzielona na dwa przewijane paski o stalej
                    wysokosci (stan postaci i plakietki), a stan postaci pokazywany jest w postaci
                    kompaktowych miernikow zamiast trybu wybranego powyzej. Przycisk po prawej
                    stronie stopki rozwija oba paski - a jesli stopka ma byc zawsze rozwinieta
                    albo zawsze zwinieta, przycisku nie ma wcale.
                </div>
                <div>
                    <label className="form-label mb-1">Kolejnosc i widocznosc paskow</label>
                    <div id="ui-bar-order-settings">
                        <BarOrderSettings
                            barOrder={draft.barOrder || defaultUiSettings.barOrder}
                            alwaysVisibleBars={draft.alwaysVisibleBars || []}
                            onChange={(barOrder, alwaysVisibleBars) => update({ barOrder, alwaysVisibleBars })}
                        />
                    </div>
                </div>
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

export default FooterTab;
