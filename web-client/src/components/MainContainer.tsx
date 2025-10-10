const MapProgress = () => (
    <div id="map-progress-container" className="position-absolute top-50 start-50 translate-middle w-75">
        <div className="progress">
            <div id="map-progress-bar" className="progress-bar progress-bar-striped progress-bar-animated" style={{width: '0'}} />
        </div>
    </div>
);

const IframeContainer = () => (
    <div id="iframe-container">
        <div id="map" />
        <div id="location-wrapper">
            <div id="location-label">
                <span id="location-text" />
            </div>
            <span id="pause-icon" hidden>
                ⏸
            </span>
        </div>
        <div id="notification-center" />
        <MapProgress />
    </div>
);

const MainTextOutput = () => (
    <div id="main_text_output_msg_wrapper">
        <div id="split-bottom" className="split-hidden">
            <div id="sticky-area" />
        </div>
    </div>
);

const ContentArea = () => (
    <div id="content-area">
        <IframeContainer />
        <MainTextOutput />
    </div>
);

const CharacterStatePanel = () => (
    <div id="char-state" data-emoji-labels="0" data-footer-mode="0">
        <span id="char-state-text" />
        <span id="state-info" />
        <div id="char-state-bars" />
        <span id="lamp-timer" />
        <span id="break-item-warning" />
        <span id="package-status" />
        <span id="attack-mode" />
        <span id="release-guard" />
        <span id="cover-timer" />
        <span id="zask-timer" />
    </div>
);

const RecordingControls = () => (
    <>
        <button
            id="recording-button"
            className="btn btn-danger btn-sm"
            style={{position: 'absolute', top: '0.5rem', right: '0.5rem', zIndex: 1012, display: 'none'}}
        >
            Zatrzymaj i zapisz
        </button>
        <div
            id="playback-controls"
            className="btn-group btn-group-sm"
            style={{position: 'absolute', top: '2.5rem', right: '0.5rem', zIndex: 1013, display: 'none'}}
        >
            <button id="playback-pause" className="btn btn-secondary">
                Pauza
            </button>
            <button id="playback-stop" className="btn btn-secondary">
                Zatrzymaj
            </button>
            <span id="playback-info" className="px-1 text-light" />
            <button id="playback-replay" className="btn btn-secondary">
                Powtórz
            </button>
            <button id="playback-step-back" className="btn btn-secondary">
                Wstecz
            </button>
            <button id="playback-step" className="btn btn-secondary">
                Krok
            </button>
        </div>
    </>
);

const OptionsModal = () => (
    <div id="options-modal" className="modal fade" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable h-100">
            <div className="modal-content h-100">
                <div className="modal-header">
                    <h5 className="modal-title">Opcje</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="modal" />
                </div>
                <div className="modal-body p-0 d-flex flex-column overflow-hidden" style={{minHeight: 0}}>
                    <div id="options" className="h-100 flex-grow-1 overflow-hidden" style={{minHeight: 0}} />
                </div>
                <div className="modal-footer">
                    <button type="button" className="btn btn-primary" id="options-save">
                        Zapisz
                    </button>
                </div>
            </div>
        </div>
    </div>
);

const ExportImportModal = () => (
    <div id="export-import-modal" className="modal fade" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
                <div className="modal-header">
                    <h5 className="modal-title">Eksport i import ustawień</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="modal" />
                </div>
                <div className="modal-body">
                    <div id="export-import-root" />
                </div>
            </div>
        </div>
    </div>
);

const BindsModal = () => (
    <div id="binds-modal" className="modal fade" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
                <div className="modal-header">
                    <h5 className="modal-title">Bindowanie</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="modal" />
                </div>
                <div className="modal-body">
                    <div id="binds-options" />
                </div>
            </div>
        </div>
    </div>
);

const NpcModal = () => (
    <div id="npc-modal" className="modal fade" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
                <div className="modal-header">
                    <h5 className="modal-title">Odbiorcy paczek</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="modal" />
                </div>
                <div className="modal-body">
                    <div id="npc-options" />
                </div>
            </div>
        </div>
    </div>
);

const ScriptsModal = () => (
    <div id="scripts-modal" className="modal fade" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
                <div className="modal-header">
                    <h5 className="modal-title">Skrypty</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="modal" />
                </div>
                <div className="modal-body">
                    <div id="scripts-options" />
                </div>
            </div>
        </div>
    </div>
);

const AliasesModal = () => (
    <div id="aliases-modal" className="modal fade" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
                <div className="modal-header">
                    <h5 className="modal-title">Aliasy</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="modal" />
                </div>
                <div className="modal-body">
                    <div id="aliases-options" />
                </div>
            </div>
        </div>
    </div>
);

const TriggersModal = () => (
    <div id="triggers-modal" className="modal fade" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
                <div className="modal-header">
                    <h5 className="modal-title">Triggery</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="modal" />
                </div>
                <div className="modal-body">
                    <div id="triggers-options" />
                </div>
            </div>
        </div>
    </div>
);

const RecordingsModal = () => (
    <div id="recordings-modal" className="modal fade" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
                <div className="modal-header">
                    <h5 className="modal-title">Nagrania</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="modal" />
                </div>
                <div className="modal-body">
                    <div id="recordings-options" />
                </div>
            </div>
        </div>
    </div>
);

const ShortcutsModal = () => (
    <div id="shortcuts-modal" className="modal fade" tabIndex={-1}>
        <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
                <div className="modal-header">
                    <h5 className="modal-title">Skróty</h5>
                    <button type="button" className="btn-close" data-bs-dismiss="modal" />
                </div>
                <div className="modal-body">
                    <div id="shortcuts-options" />
                </div>
            </div>
        </div>
    </div>
);

const OptionsModals = () => (
    <>
        <OptionsModal />
        <ExportImportModal />
        <BindsModal />
        <NpcModal />
        <ScriptsModal />
        <AliasesModal />
        <TriggersModal />
        <RecordingsModal />
        <ShortcutsModal />
    </>
);

export function MainContainer() {
    return (
        <div id="main-container">
            <ContentArea />
            <div id="multi-binds" />
            <CharacterStatePanel />
            <div id="objects-list" />
            <RecordingControls />
            <span id="content-width-measure" style={{visibility: 'hidden', position: 'absolute', whiteSpace: 'pre'}}>
                M
            </span>
            <OptionsModals />
        </div>
    );
}
