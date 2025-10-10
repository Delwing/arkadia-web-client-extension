export function LogsModal() {
    return (
        <div id="logs-modal" className="modal fade" tabIndex={-1}>
            <div className="modal-dialog modal-lg modal-dialog-scrollable">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Logi</h5>
                        <button type="button" className="btn-close" data-bs-dismiss="modal" />
                    </div>
                    <div className="modal-body d-flex flex-column gap-2">
                        <div className="form-check form-switch">
                            <input id="logs-enabled" className="form-check-input" type="checkbox" />
                            <label className="form-check-label" htmlFor="logs-enabled">
                                Zapisuj logi
                            </label>
                        </div>
                        <div className="d-flex gap-2">
                            <select id="logs-session-select" className="form-select" />
                            <button id="logs-download" className="btn btn-secondary">
                                Pobierz
                            </button>
                        </div>
                        <div id="logs-preview" className="border" />
                    </div>
                </div>
            </div>
        </div>
    );
}
