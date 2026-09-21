import WiedzaImport from "./WiedzaImport";
import ZlomImport from "./ZlomImport";
import PostepyImport from "./PostepyImport";
import MultibindImport from "./MultibindImport";
import AliasImport from "./AliasImport";
import mudletIcon from "./icons/mudlet.png";
import blowtorchIcon from "./icons/blowtorch.png";
// Inlined, not <img>: the dragon is drawn in currentColor so it follows the theme.
import arkadiaIcon from "./icons/arkadia.svg?raw";

/**
 * Ustawienia → Dane → Import z innych klientów: every import of another
 * client's data in one place, grouped by where the file comes from. The
 * windows that own the data (Wiedza, Złom, Postępy, Bindowanie, Aliasy) keep
 * their import buttons as shortcuts to this page.
 */
export default function ImportPage() {
    return (
        <div className="ui-settings-stack">
            <p className="popup-field__hint">
                Przenieś dane z innego klienta. Importy z Mudleta najpierw pokazują, co znalazły w pliku, i nic nie zmieniają, dopóki nie klikniesz „Importuj”. Aliasy są dodawane od razu — istniejące o tym samym wzorcu zostają bez zmian.
            </p>
            <section className="character-settings-section">
                <h5 className="character-settings-section-title import-source">
                    <img src={mudletIcon} alt="" className="import-source__icon" />
                    Mudlet
                </h5>
                <div className="import-list">
                    <WiedzaImport />
                    <ZlomImport />
                    <PostepyImport />
                    <MultibindImport row />
                </div>
            </section>
            <section className="character-settings-section">
                <h5 className="character-settings-section-title import-source">
                    <span className="import-source__icon" dangerouslySetInnerHTML={{ __html: arkadiaIcon }} />
                    Klient Arkadii
                </h5>
                <div className="import-list">
                    <AliasImport source="arkadia" />
                </div>
            </section>
            <section className="character-settings-section">
                <h5 className="character-settings-section-title import-source">
                    <img src={blowtorchIcon} alt="" className="import-source__icon" />
                    Blowtorch
                </h5>
                <div className="import-list">
                    <AliasImport source="blowtorch" />
                </div>
            </section>
        </div>
    );
}
