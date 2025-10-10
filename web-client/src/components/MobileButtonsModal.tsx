export function MobileButtonsModal() {
    return (
        <div id="mobile-buttons-modal" className="modal fade" tabIndex={-1}>
            <div className="modal-dialog">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Przyciski mobilne</h5>
                        <button type="button" className="btn-close" data-bs-dismiss="modal" />
                    </div>
                    <div className="modal-body position-relative d-flex flex-column align-items-center gap-2">
                        <div id="mobile-buttons-options" />
                    </div>
                </div>
            </div>
        </div>
    );
}
