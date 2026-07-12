/**
 * Forge UI — the "Forged" HUD (React).
 *
 * Builds the full game client (transport, triggers, rendering, input, vitals)
 * via the same stable contract the stock UI uses, then renders the HUD around it.
 * The client is provided through ClientContext; DOM-bound wiring (width measurer,
 * map mount, game-log append) runs inside component effects.
 */
import './style.css';
import { createRoot } from 'react-dom/client';
import { setDockingSupported } from '@web/layout/utils/layoutStorage';
import { createClient } from './client/bootstrap';
import { ClientProvider } from './client/ClientContext';
import App from './components/App';

// Forge-ui shows popups as plain floating windows — it has no dock slots. Tell
// the shared popup layer so a popup merely docked in the stock UI does not
// auto-open here (only pinned popups do). Must run before the first popup
// component renders (usePopup reads this synchronously on mount).
setDockingSupported(false);

const client = createClient();

createRoot(document.getElementById('root')!).render(
    <ClientProvider value={client}>
        <App />
    </ClientProvider>,
);
