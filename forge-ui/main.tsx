/**
 * Standalone forge page (`forge-ui/index.html`). The main page can host the same
 * HUD as its forge shell — see src/web/shell/forgeShell.ts.
 */
import { setActiveShell } from '@web/shell/uiShell';
import { startForge } from './start';

setActiveShell('forge');

// Served from forge-ui/, so the popout entry at the deploy root is one level up.
startForge(document.getElementById('root')!, { popoutEntry: '../popup/index.html' });
