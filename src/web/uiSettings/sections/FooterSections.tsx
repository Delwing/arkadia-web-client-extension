import type { UiSettings } from "../../uiSettingsCore";
import { defaultUiSettings } from "../../defaultUiSettings";
import BarOrderSettings from "../../options/BarOrderSettings";
import FooterComponentSettings from "../../options/FooterComponentSettings";
import { DeviceOnlyBadge } from "../fields";
import { CheckboxField, SelectField, SettingsCard, SettingsHint } from "@web/settings/controls.tsx";

interface FooterSectionsProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

function FooterSections({ draft, update }: FooterSectionsProps) {
    return (
        <>
            <SettingsCard title="Stan postaci">
                <SelectField id="ui-footer-mode" labelExtra={<DeviceOnlyBadge settingKey="footerMode" />} label="Tryb stopki" value={String(draft.footerMode)} onChange={(v) => update({ footerMode: parseInt(v) || 0 })}>
                    <option value="0">Liczbowy</option>
                    <option value="1">Pasek</option>
                    <option value="2">Pasek jednolity</option>
                    <option value="3">Pasek graficzny</option>
                </SelectField>
                <CheckboxField id="ui-emoji-labels" label="Etykiety emoji" checked={draft.emojiLabels} onChange={(v) => update({ emojiLabels: v })} />
                <div className="settings-field">
                    <span className="settings-field__label">Kolejnosc i widocznosc paskow<DeviceOnlyBadge settingKey="barOrder" /></span>
                    <div id="ui-bar-order-settings" className="settings-stack settings-stack--tight">
                        <BarOrderSettings
                            barOrder={draft.barOrder || defaultUiSettings.barOrder}
                            alwaysVisibleBars={draft.alwaysVisibleBars || []}
                            onChange={(barOrder, alwaysVisibleBars) => update({ barOrder, alwaysVisibleBars })}
                        />
                    </div>
                </div>
            </SettingsCard>

            <SettingsCard title="Stopka na telefonie">
                <SettingsHint>
                    Na waskim ekranie stopka jest podzielona na dwa przewijane paski o stalej
                    wysokosci (stan postaci i plakietki), a stan postaci pokazywany jest w postaci
                    kompaktowych miernikow zamiast trybu stopki. Przycisk po prawej stronie stopki
                    rozwija oba paski - a jesli stopka ma byc zawsze rozwinieta albo zawsze
                    zwinieta, przycisku nie ma wcale.
                </SettingsHint>
                <CheckboxField
                    id="ui-mobile-footer-compact"
                    labelExtra={<DeviceOnlyBadge settingKey="mobileFooterCompact" />}
                    label="Kompaktowa stopka na telefonie"
                    checked={draft.mobileFooterCompact}
                    onChange={(v) => update({ mobileFooterCompact: v })}
                />
                <SelectField
                    id="ui-mobile-footer-expand"
                    labelExtra={<DeviceOnlyBadge settingKey="mobileFooterExpand" />}
                    label="Rozwijanie stopki na telefonie"
                    value={draft.mobileFooterExpand}
                    disabled={!draft.mobileFooterCompact}
                    onChange={(v) => update({ mobileFooterExpand: v as UiSettings['mobileFooterExpand'] })}
                >
                    <option value="toggle">Zwinieta, z przyciskiem</option>
                    <option value="expanded">Zawsze rozwinieta</option>
                    <option value="collapsed">Zawsze zwinieta</option>
                </SelectField>
            </SettingsCard>

            <SettingsCard title="Elementy stopki" full headerExtra={<DeviceOnlyBadge settingKey="footerComponents" />}>
                <div id="ui-footer-components-settings" className="settings-stack settings-stack--tight">
                    <FooterComponentSettings
                        components={draft.footerComponents}
                        onChange={(footerComponents) => update({ footerComponents })}
                    />
                </div>
            </SettingsCard>
        </>
    );
}

export default FooterSections;
