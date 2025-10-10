export function InputArea() {
    return (
        <div id="input-area">
            <div id="history-buttons">
                <button id="history-up-button">▲</button>
                <button id="history-down-button">▼</button>
            </div>
            <input type="search" id="message-input" autoComplete="false" autoCapitalize="off" spellCheck={false} />
            <button id="send-button">➢</button>
            <div className="dropdown me-0 me-md-2">
                <button id="menu-button" className="dropdown-toggle h-100" data-bs-toggle="dropdown">
                    ⋮
                </button>
                <ul className="dropdown-menu dropdown-menu-end mb-1 gap-2">
                    <li>
                        <button className="w-100 p-1" id="options-button">
                            Ustawienia
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="export-import-button">
                            Eksport / import
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="ui-settings-button">
                            Interfejs
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="mobile-buttons-button">
                            Przyciski
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="binds-button">
                            Bindowanie
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="npc-button">
                            Odbiorcy paczek
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="scripts-button">
                            Skrypty
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="aliases-button">
                            Aliasy
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="triggers-button">
                            Triggery
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="recordings-button">
                            Nagrania
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="shortcuts-button">
                            Skróty
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="docs-button">
                            Dokumentacja
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="logs-button">
                            Logi
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="debug-button">
                            Debugowanie
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="share-location-button">
                            Kod QR lokacji
                        </button>
                    </li>
                    <li>
                        <button className="w-100 p-1" id="fullscreen-button" title="Pełny ekran">
                            ⛶
                        </button>
                    </li>
                </ul>
            </div>
        </div>
    );
}
