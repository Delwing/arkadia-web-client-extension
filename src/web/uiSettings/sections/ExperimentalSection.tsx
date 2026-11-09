import type { UiSettings } from "../../uiSettingsCore";
import { CheckboxRow, SettingsSection } from "../fields";

interface ExperimentalSectionProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
}

/** Features still being tried out in play. Everything here is off by default. */
export default function ExperimentalSection({ draft, update }: ExperimentalSectionProps) {
    return (
        <SettingsSection title="Kolejka kroków mapy">
            <CheckboxRow
                id="ui-map-shadow-marker"
                label="Znacznik kolejki kroków na mapie"
                hint="Różowe obramowanie pomieszczenia, w którym według kolejki jesteś: ostatniego potwierdzonego przez grę (room.info) i kroków, na które gra jeszcze nie odpowiedziała. Gdy rozjeżdża się ze znacznikiem postaci, kolejka i mapa nie zgadzają się co do pozycji. Szczegóły: /mapkolejka."
                checked={draft.mapShadowMarker}
                onChange={(v) => update({ mapShadowMarker: v })}
            />
            <CheckboxRow
                id="ui-map-step-queue-correction"
                label="Poprawiaj mapę według kolejki kroków"
                hint="Gdy gra potwierdzi krok, odpowie na rozejrzenie się albo odmówi przejścia, a mapa stoi gdzie indziej niż wynika z kolejki - mapa przeskakuje tam, gdzie wskazuje kolejka. Pomaga, gdy przy lagach wpiszesz kilka kroków, a któryś z nich zablokuje przeszkoda."
                checked={draft.mapStepQueueCorrection}
                onChange={(v) => update({ mapStepQueueCorrection: v })}
            />
        </SettingsSection>
    );
}
