/**
 * Alt UI — a minimal proof-of-concept shell.
 *
 * Its only job is to prove that the game client (`src/client`) is genuinely
 * UI-agnostic: this file drives the full client stack — transport, triggers,
 * rendering, input — WITHOUT `src/web/main.ts`, the options panels, the layout
 * manager, or any of the React islands.
 *
 * What it relies on is exactly the stable contract a new UI builds against:
 *   - `ClientAdapter` (the transport)      — reused here via `@web/MudClient`
 *   - the typed `eventBus` / `'message'`   — for rendering game output
 *   - `AnsiAwareBuffer.toDom()`            — the render seam
 *   - `client.setContentWidth()`           — pushed in by the width measurer
 *   - `client.sendCommand()`               — the input path
 *   - the injected UI/plugin-host ports    — here left as trivial no-ops
 *
 * The client core is imported with ZERO `@web` imports of its own (enforced by
 * the eslint boundary rule); everything web-specific is supplied from this file.
 */
import mudClient from '@web/MudClient';
import Client from '@client/Client';
import { registerScripts } from '@client/main';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import eventBus from '@modules/core/eventBus';
import { globalStorage } from '@modules/core/storage';
import { setUiPort } from '@client/ports';
import { installContentWidthMeasurer } from '@web/contentWidthMeasurer';
import { defaultUiSettings } from '@web/defaultUiSettings';
import {
    getRenderSettings,
    setRenderSettings,
    onRenderSettingsChange,
} from '@modules/core/settings';

// Seed default UI settings so settings-dependent scripts have sane values,
// exactly as the real UI would provide them.
if (!globalStorage.get('uiSettings')) {
    globalStorage.set('uiSettings', defaultUiSettings);
}

// Trivial ports: this shell has no tooltips or context menu, so the client's
// UI calls become no-ops (context-menu clicks are logged to prove the client
// still drives them). The plugin-host port is left as its no-op default.
setUiPort({
    showHerbTooltip() {},
    hideHerbTooltip() {},
    showBookTooltip() {},
    hideBookTooltip() {},
    showContextMenu(items) {
        console.log('[alt-ui] context menu requested:', items.map(i => i.label));
    },
});

const client = new Client(mudClient);
registerScripts(client);

// Measure terminal column width from this shell's DOM and push it into the
// (DOM-free) client — the same measurer the real web UI uses.
installContentWidthMeasurer(client);

// --- Rendering: the entire output path is this one event subscription. --------
const output = document.getElementById('main_text_output_msg_wrapper') as HTMLElement;

// Read the shared render settings (font size, output background) through the
// concern-scoped accessor — no dependence on the stock UI's chrome settings.
// Applying them here proves the alt UI can consume main-profile settings; the
// timestamps toggle below proves it can write one back without disturbing chrome.
function applyRenderSettings(): void {
    const render = getRenderSettings();
    output.style.background = render.outputBackground;
    output.style.fontSize = `${render.contentFontSize * 100}%`;
    document.body.classList.toggle('alt-show-timestamps', render.showTimestamps);
}
applyRenderSettings();
onRenderSettingsChange(applyRenderSettings);

const timestampsToggle = document.getElementById('alt-timestamps') as HTMLInputElement | null;
if (timestampsToggle) {
    timestampsToggle.checked = getRenderSettings().showTimestamps;
    timestampsToggle.addEventListener('change', () => {
        // Write-back through the accessor: merges into the shared blob, leaving
        // every stock-chrome field (footer, buttons, layout…) untouched.
        setRenderSettings({ showTimestamps: timestampsToggle.checked });
    });
}

eventBus.on('message', (message?: string | AnsiAwareBuffer, type?: string) => {
    const line = document.createElement('div');
    line.className = 'alt-line' + (type ? ` alt-type-${type}` : '');
    if (message instanceof AnsiAwareBuffer) {
        line.appendChild(message.toDom());
    } else if (typeof message === 'string') {
        line.textContent = message;
    } else {
        return;
    }
    const atBottom = output.scrollTop + output.clientHeight >= output.scrollHeight - 4;
    output.appendChild(line);
    if (atBottom) {
        output.scrollTop = output.scrollHeight;
    }
});

// --- Connection status --------------------------------------------------------
const status = document.getElementById('alt-status') as HTMLElement;
const setStatus = (text: string, connected: boolean) => {
    status.textContent = text;
    status.className = connected ? 'connected' : 'disconnected';
};
eventBus.on('client.connect', () => setStatus('connected', true));
eventBus.on('client.disconnect', () => setStatus('disconnected', false));

document.getElementById('alt-connect')!.addEventListener('click', () => {
    setStatus('connecting…', false);
    mudClient.connect();
});

// --- Input: the entire command path is this one handler. ----------------------
const input = document.getElementById('alt-input') as HTMLInputElement;
input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const command = input.value;
    input.value = '';
    // fromUserInput=true so the client treats it like a typed command.
    void client.sendCommand(command, true, undefined, false, true);
});
input.focus();
