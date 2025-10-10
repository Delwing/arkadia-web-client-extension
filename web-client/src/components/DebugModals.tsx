export function DebugModals() {
    return (
        <>
            <div id="debug-modal" className="modal fade" tabIndex={-1}>
                <div className="modal-dialog modal-xl modal-dialog-scrollable">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">Debug Log</h5>
                            <div className="d-flex gap-2 align-items-center">
                                <button type="button" className="btn btn-secondary btn-sm" id="trigger-tester-button">
                                    Tester triggerów
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" id="trigger-finder-button">
                                    Trigger finder
                                </button>
                                <button type="button" className="btn btn-secondary btn-sm" id="notification-schedule-button">
                                    Powiadomienie
                                </button>
                                <button type="button" className="btn-close" data-bs-dismiss="modal" />
                            </div>
                        </div>
                        <div id="debug-content" className="debug-content modal-body overflow-auto" />
                    </div>
                </div>
            </div>

            <div id="trigger-tester-modal" className="modal fade" tabIndex={-1}>
                <div className="modal-dialog modal-lg">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">Tester triggerów</h5>
                            <button type="button" className="btn-close" data-bs-dismiss="modal" />
                        </div>
                        <div className="modal-body d-flex flex-column gap-2">
                            <div>
                                <label htmlFor="trigger-tester-filter" className="form-label mb-1">
                                    Filtr wzorca
                                </label>
                                <input id="trigger-tester-filter" className="form-control" />
                            </div>
                            <div>
                                <label className="form-label mb-1">Wybierz trigger</label>
                                <div id="trigger-tester-tree" className="border p-1" style={{maxHeight: '15rem', overflow: 'auto'}} />
                            </div>
                            <div>
                                <label htmlFor="trigger-tester-line" className="form-label mb-1">
                                    Linia
                                </label>
                                <input id="trigger-tester-line" className="form-control" />
                            </div>
                            <div>
                                <label htmlFor="trigger-tester-type" className="form-label mb-1">
                                    Typ GMCP
                                </label>
                                <input id="trigger-tester-type" className="form-control" />
                            </div>
                            <button className="btn btn-primary" id="trigger-tester-run">
                                Testuj
                            </button>
                            <pre id="trigger-tester-output" className="mb-0" />
                        </div>
                    </div>
                </div>
            </div>

            <div id="trigger-finder-modal" className="modal fade" tabIndex={-1}>
                <div className="modal-dialog modal-lg">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h5 className="modal-title">Trigger finder</h5>
                            <button type="button" className="btn-close" data-bs-dismiss="modal" />
                        </div>
                        <div className="modal-body d-flex flex-column gap-2">
                            <div>
                                <label htmlFor="trigger-finder-lines" className="form-label mb-1">
                                    Linie
                                </label>
                                <textarea id="trigger-finder-lines" className="form-control" rows={6} />
                            </div>
                            <div>
                                <label htmlFor="trigger-finder-type" className="form-label mb-1">
                                    Typ GMCP
                                </label>
                                <input id="trigger-finder-type" className="form-control" />
                            </div>
                            <button className="btn btn-primary" id="trigger-finder-run">
                                Znajdź
                            </button>
                            <pre id="trigger-finder-output" className="mb-0" />
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
