import {useEffect} from 'react';
import {MainContainer} from './components/MainContainer';
import {InputArea} from './components/InputArea';
import {AuthOverlay} from './components/AuthOverlay';
import {UiSettingsModal} from './components/UiSettingsModal';
import {MobileButtonsModal} from './components/MobileButtonsModal';
import {DebugModals} from './components/DebugModals';
import {LogsModal} from './components/LogsModal';
import {LocationShareModal} from './components/LocationShareModal';
import {MobileDirectionButtons} from './components/MobileDirectionButtons';
import {LetterComposer} from './components/LetterComposer';
import {ContextMenu} from './components/ContextMenu';

export default function App() {
    useEffect(() => {
        if (!document.body.dataset.mapPosition) {
            document.body.dataset.mapPosition = 'top-overlay';
        }
    }, []);

    return (
        <>
            <MainContainer />
            <InputArea />
            <AuthOverlay />
            <button id="connect-button-float">🔌</button>
            <UiSettingsModal />
            <MobileButtonsModal />
            <DebugModals />
            <LogsModal />
            <LocationShareModal />
            <MobileDirectionButtons />
            <LetterComposer />
            <ContextMenu />
        </>
    );
}
