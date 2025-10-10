export function UiSettingsModal() {
    return (
        <div id="ui-settings-modal" className="modal fade" tabIndex={-1}>
            <div className="modal-dialog">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Ustawienia UI</h5>
                        <button type="button" className="btn-close" data-bs-dismiss="modal" />
                    </div>
                    <div className="modal-body">
                        <div className="ui-settings-layout">
                            <section className="ui-settings-section">
                                <h6 className="ui-settings-section-title">Mapa</h6>
                                <div className="ui-settings-stack">
                                    <div>
                                        <label className="form-label" htmlFor="ui-map-scale">
                                            Powiększenie mapy
                                        </label>
                                        <input id="ui-map-scale" type="number" step="0.05" min="0.05" className="form-control" />
                                    </div>
                                    <div>
                                        <label className="form-label" htmlFor="ui-map-height">
                                            Wysokość mapy (vh)
                                        </label>
                                        <input id="ui-map-height" type="number" step="1" className="form-control" />
                                    </div>
                                    <div>
                                        <label className="form-label" htmlFor="ui-map-position">
                                            Położenie mapy
                                        </label>
                                        <select id="ui-map-position" className="form-select">
                                            <option value="top-overlay">Góra (nakładka)</option>
                                            <option value="bottom-overlay">Dół (nakładka)</option>
                                            <option value="right-overlay">Prawa (nakładka)</option>
                                            <option value="left-overlay">Lewa (nakładka)</option>
                                            <option value="top">Góra</option>
                                            <option value="bottom">Dół</option>
                                            <option value="right">Prawa</option>
                                            <option value="left">Lewa</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label" htmlFor="ui-label-render-mode">
                                            Tryb renderowania etykiet
                                        </label>
                                        <select id="ui-label-render-mode" className="form-select">
                                            <option value="image">Obraz</option>
                                            <option value="data">Dane</option>
                                        </select>
                                    </div>
                                    <div className="form-check">
                                        <input id="ui-instant-move" type="checkbox" className="form-check-input" />
                                        <label className="form-check-label" htmlFor="ui-instant-move">
                                            Natychmiastowe przechodzenie po mapie
                                        </label>
                                    </div>
                                    <div className="form-check">
                                        <input id="ui-highlight-current-room" type="checkbox" className="form-check-input" />
                                        <label className="form-check-label" htmlFor="ui-highlight-current-room">
                                            Podświetl bieżące pomieszczenie
                                        </label>
                                    </div>
                                    <div className="form-check">
                                        <input id="ui-exploration-mode" type="checkbox" className="form-check-input" />
                                        <label className="form-check-label" htmlFor="ui-exploration-mode">
                                            Tryb eksploracji mapy <span id="ui-exploration-stats" className="ms-1 text-muted" />
                                        </label>
                                    </div>
                                    <div className="form-check">
                                        <input id="ui-transparent-labels" type="checkbox" className="form-check-input" />
                                        <label className="form-check-label" htmlFor="ui-transparent-labels">
                                            Przezroczyste etykiety (wymusza tryb danych)
                                        </label>
                                    </div>
                                </div>
                            </section>
                            <section className="ui-settings-section">
                                <h6 className="ui-settings-section-title">Przyciski mobilne</h6>
                                <div className="ui-settings-stack">
                                    <div>
                                        <label className="form-label" htmlFor="ui-button-size">
                                            Rozmiar przycisków mobilnych (%)
                                        </label>
                                        <input id="ui-button-size" type="number" step="0.1" className="form-control" />
                                    </div>
                                    <div className="form-check">
                                        <input id="ui-show-buttons" type="checkbox" className="form-check-input" />
                                        <label className="form-check-label" htmlFor="ui-show-buttons">
                                            Pokaż przyciski na ekranie
                                        </label>
                                    </div>
                                    <div className="form-check">
                                        <input id="ui-haptic-feedback" type="checkbox" className="form-check-input" />
                                        <label className="form-check-label" htmlFor="ui-haptic-feedback">
                                            Wibracje przycisków mobilnych
                                        </label>
                                    </div>
                                </div>
                            </section>
                            <section className="ui-settings-section">
                                <h6 className="ui-settings-section-title">Wygląd</h6>
                                <div className="ui-settings-stack">
                                    <div>
                                        <label className="form-label" htmlFor="ui-content-font">
                                            Rozmiar czcionki treści (rem)
                                        </label>
                                        <input id="ui-content-font" type="number" step="0.1" className="form-control" />
                                    </div>
                                    <div>
                                        <label className="form-label" htmlFor="ui-objects-font">
                                            Rozmiar czcionki listy obiektów (rem)
                                        </label>
                                        <input id="ui-objects-font" type="number" step="0.1" className="form-control" />
                                    </div>
                                    <div>
                                        <label className="form-label" htmlFor="ui-footer-mode">
                                            Tryb stopki
                                        </label>
                                        <select id="ui-footer-mode" className="form-select">
                                            <option value="0">Liczbowy</option>
                                            <option value="1">Pasek</option>
                                            <option value="2">Pasek jednolity</option>
                                            <option value="3">Pasek graficzny</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="form-label" htmlFor="ui-xterm-palette">
                                            Paleta kolorów
                                        </label>
                                        <select id="ui-xterm-palette" className="form-select">
                                            <option value="arkadia">Arkadia</option>
                                            <option value="proper">XTerm</option>
                                        </select>
                                    </div>
                                    <div className="form-check">
                                        <input id="ui-emoji-labels" type="checkbox" className="form-check-input" />
                                        <label className="form-check-label" htmlFor="ui-emoji-labels">
                                            Etykiety emoji w stanie postaci
                                        </label>
                                    </div>
                                    <div className="form-check">
                                        <input id="ui-fight-title-icon" type="checkbox" className="form-check-input" />
                                        <label className="form-check-label" htmlFor="ui-fight-title-icon">
                                            Ikona walki w tytule
                                        </label>
                                    </div>
                                </div>
                            </section>
                            <section className="ui-settings-section">
                                <h6 className="ui-settings-section-title">Powiadomienia</h6>
                                <div className="ui-settings-stack">
                                    <button type="button" className="btn btn-warning align-self-start" id="ui-enable-notifications">
                                        Włącz powiadomienia
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button type="button" className="btn btn-primary" id="ui-settings-save">
                            Zapisz
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
