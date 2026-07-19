import '@xterm/xterm/css/xterm.css';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import mudClient from '@web/MudClient';
import { bootstrapGameClient } from '@web/clientBootstrap';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import eventBus from '@modules/core/eventBus';

/**
 * Spike: real game output rendered by an actual terminal emulator instead of
 * DOM/HTML. No UiPort is installed (tooltips/context menus/plugin popups just
 * no-op — this shell doesn't render them), and there's no styling beyond a
 * bare command line: the point is to see how `AnsiAwareBuffer.toAnsi()` output
 * looks fed straight into xterm.js.
 */
const { client } = bootstrapGameClient({ installPorts: () => {} });

const term = new Terminal({
    convertEol: true,
    scrollback: 5000,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 14,
    theme: { background: '#000000' },
});
const fitAddon = new FitAddon();
term.loadAddon(fitAddon);
term.open(document.getElementById('terminal')!);
fitAddon.fit();

const pushContentWidth = () => client.setContentWidth(term.cols);
pushContentWidth();
window.addEventListener('resize', () => {
    fitAddon.fit();
    pushContentWidth();
});
term.onResize(pushContentWidth);

eventBus.on('message', (message?: string | AnsiAwareBuffer) => {
    if (message === undefined) return;
    const ansi = message instanceof AnsiAwareBuffer ? message.toAnsi() : message;
    term.write(ansi + '\r\n');
});

const cmd = document.getElementById('cmd') as HTMLInputElement;
cmd.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !cmd.value) return;
    client.sendCommand(cmd.value, true);
    cmd.value = '';
});

mudClient.connect();
