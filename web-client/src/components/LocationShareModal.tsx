export function LocationShareModal() {
    return (
        <div id="location-share-modal" className="modal fade" tabIndex={-1}>
            <div className="modal-dialog">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Kod QR lokacji</h5>
                        <button type="button" className="btn-close" data-bs-dismiss="modal" />
                    </div>
                    <div className="modal-body d-flex justify-content-center">
                        <img id="location-qr-image" alt="QR code" />
                    </div>
                </div>
            </div>
        </div>
    );
}
