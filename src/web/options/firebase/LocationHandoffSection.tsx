import { useState } from "react";
import { Check } from "@web-ui/primitives/index.ts";
import { loadFirebaseSettings, saveFirebaseSettings } from "@modules/firebase";
import { setSessionHandoffEnabled } from "@web/sessionHandoff.ts";

/** The switch for handing the map location over between devices. */
function LocationHandoffSection() {
    const [locationHandoffEnabled, setLocationHandoffEnabled] = useState(() => loadFirebaseSettings().locationHandoffEnabled);

    const toggleLocationHandoff = (enabled: boolean) => {
        setLocationHandoffEnabled(enabled);
        saveFirebaseSettings({ locationHandoffEnabled: enabled });
        setSessionHandoffEnabled(enabled);
    };

    return (
        <section className="character-settings-section">
            <Check
                id="location-handoff-toggle"
                label="Przekazuj lokalizację między urządzeniami"
                checked={locationHandoffEnabled}
                onChange={e => toggleLocationHandoff(e.target.checked)}
            />
            <div className="popup-muted popup-small">
                Gdy zalogujesz się na postać grającą na innym urządzeniu, mapa przejmie jej
                lokalizację. Urządzenie zapisuje w chmurze pomieszczenie, w którym jesteś, gdy
                kończy się sesja albo karta przechodzi w tło - nie każdy krok.
            </div>
        </section>
    );
}

export default LocationHandoffSection;
