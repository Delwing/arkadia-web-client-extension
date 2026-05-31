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
