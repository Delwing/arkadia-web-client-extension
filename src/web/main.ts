/**
 * Entry of the main page: picks the shell and loads it.
 *
 * The page hosts two shells around the same game client — the classic stock
 * chrome (`stockMain.ts`) and the forge HUD (`forge-ui/`). Each brings its own
 * global stylesheets, so only the chosen one may load: both are dynamic imports,
 * and Vite keeps each one's CSS in its own chunk. The choice is per device (see
 * `shell/uiShell.ts`); switching reloads the page.
 *
 * index.html keeps the body hidden until a shell marks itself ready, so the
 * static stock markup never flashes unstyled while the chunk arrives.
 */
import { resolveBootShell, setActiveShell } from './shell/uiShell';

const shell = resolveBootShell();
setActiveShell(shell);
document.documentElement.dataset.shell = shell;

const markReady = () => {
    document.documentElement.dataset.shellReady = '';
};

const load = shell === 'forge'
    ? import('./shell/forgeShell').then(({ startForgeShell }) => startForgeShell())
    : import('./stockMain');

load.then(markReady, (error) => {
    markReady();
    console.error(`Failed to load the ${shell} shell`, error);
});
