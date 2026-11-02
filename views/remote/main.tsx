/**
 * The phone side of remote control. Never connects to the game: it finds a PC
 * tab (through the dev server, or the public PeerJS server), opens a WebRTC
 * data channel to it, shows what the PC streams and sends commands back.
 */

import ReactDOM from 'react-dom/client';
import { RemoteApp } from './RemoteApp.tsx';
import './remote.css';
import { prefs } from './prefs';

/** Opened from the PC's QR: keep its pairing code, then take it out of the address bar. */
function takePairing(): boolean {
    const fragment = new URLSearchParams(location.hash.slice(1));
    const pairHost = fragment.get('host');
    const pairCode = fragment.get('pair');
    if (!pairHost || !pairCode) return false;
    prefs.setPairCode(pairHost, pairCode);
    prefs.setLastHost(pairHost);
    history.replaceState(null, '', location.pathname + location.search);
    return true;
}

takePairing();
// A QR opened in a tab that already shows this page only changes the fragment: start over with the new code.
window.addEventListener('hashchange', () => {
    if (takePairing()) location.reload();
});

ReactDOM.createRoot(document.getElementById('root')!).render(<RemoteApp />);
