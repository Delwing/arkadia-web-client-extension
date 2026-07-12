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
import { createClient } from './client/bootstrap';
import { ClientProvider } from './client/ClientContext';
import App from './components/App';

const client = createClient();

createRoot(document.getElementById('root')!).render(
    <ClientProvider value={client}>
        <App />
    </ClientProvider>,
);
