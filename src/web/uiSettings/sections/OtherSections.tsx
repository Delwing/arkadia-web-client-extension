import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxRow, SelectField, SettingsSection } from "../fields";

// Seconds between latency pings on offer; 0 turns them off.
const PING_INTERVALS = [3, 10, 30, 60, 0];

interface OtherSectionsProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

export function MobileButtonsSection({ draft, update }: OtherSectionsProps) {
    return (
        <SettingsSection title="Wyświetlanie">
            <CheckboxRow id="ui-show-buttons" label="Pokaż przyciski na ekranie" checked={draft.showButtons} onChange={(v) => update({ showButtons: v })} />
            <CheckboxRow id="ui-haptic-feedback" label="Wibracje przycisków mobilnych" checked={draft.hapticFeedback} onChange={(v) => update({ hapticFeedback: v })} />
        </SettingsSection>
    );
}

export function OtherSection({ draft, update }: OtherSectionsProps) {
    return (
        <SettingsSection title="Inne">
            <CheckboxRow id="ui-fight-title-icon" label="Ikona walki w tytule" checked={draft.fightTitleIcon} onChange={(v) => update({ fightTitleIcon: v })} />
            <CheckboxRow id="ui-wake-lock" label="Blokada usypiania ekranu (Wake Lock)" checked={draft.wakeLock} onChange={(v) => update({ wakeLock: v })} />
            <SelectField id="ui-ping-interval" label="Pomiar pingu" hint="Jak często klient mierzy opóźnienie do gry (liczba i wykres w chipie połączenia). Na danych komórkowych częsty ping nie pozwala modemowi przejść w tryb oszczędzania, więc rzadszy pomiar lub jego wyłączenie oszczędza baterię. Ustawienie dotyczy tylko tego urządzenia." value={String(draft.pingInterval)} onChange={(v) => update({ pingInterval: Number(v) })}>
                {!PING_INTERVALS.includes(draft.pingInterval) && <option value={draft.pingInterval}>Co {draft.pingInterval} s</option>}
                {PING_INTERVALS.map((s) => (
                    <option key={s} value={s}>{s === 0 ? "Wyłączony" : `Co ${s} s${s === 3 ? " (domyślnie)" : ""}`}</option>
                ))}
            </SelectField>
            <CheckboxRow id="ui-in-game-update-notice" label="Informuj o nowej wersji także w trakcie gry" checked={draft.inGameUpdateNotice} onChange={(v) => update({ inGameUpdateNotice: v })} />
            <SelectField id="ui-trigger-prefilter" label="Filtr triggerów" hint="Pomija triggery, które nie mogą pasować do linii, co przyspiesza przetwarzanie tekstu z gry. Weryfikacja niczego nie pomija, tylko zgłasza w konsoli przeglądarki linie, przy których filtr by się pomylił." value={draft.triggerPrefilter} onChange={(v) => update({ triggerPrefilter: v as UiSettings['triggerPrefilter'] })}>
                <option value="on">Włączony</option>
                <option value="off">Wyłączony</option>
                <option value="verify">Weryfikacja (diagnostyka, błędy w konsoli)</option>
            </SelectField>
        </SettingsSection>
    );
}
