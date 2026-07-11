/**
 * Alt UI — the "Forged" HUD.
 *
 * Drives the full game client (transport, triggers, rendering, input, vitals)
 * through the same stable contract the stock UI uses, with none of its chrome:
 *   - the 'message' event + AnsiAwareBuffer.toDom()  → the game log
 *   - message type 'room.short'                      → the location header
 *   - gmcp.char.state / gmcp.char.options            → the vital gems
 *   - client.sendCommand()                           → the command trough
 *   - the injected ports (no-op here) + width measurer
 */
import './style.css';
import mudClient from '@web/MudClient';
import Client from '@client/Client';
import { registerScripts } from '@client/main';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import eventBus from '@modules/core/eventBus';
import { globalStorage } from '@modules/core/storage';
import { setUiPort } from '@client/ports';
import { installContentWidthMeasurer } from '@web/contentWidthMeasurer';
import { defaultUiSettings } from '@web/defaultUiSettings';
import { getColorLevel } from '@web/colors';
import { EmbeddedMap } from '@web/embed';
import { loadMapData, loadColors, subscribeToMapData } from '@web/mapDataLoader';
import { DarkModern } from 'mudlet-map-renderer';

if (!globalStorage.get('uiSettings')) {
    globalStorage.set('uiSettings', defaultUiSettings);
}

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
installContentWidthMeasurer(client);

// --- Game log ----------------------------------------------------------------
const output = document.getElementById('main_text_output_msg_wrapper') as HTMLElement;
const MAX_LINES = 500;

const textOf = (message: string | AnsiAwareBuffer): string =>
    message instanceof AnsiAwareBuffer ? message.text : message;

function appendLine(el: HTMLElement): void {
    const atBottom = output.scrollTop + output.clientHeight >= output.scrollHeight - 6;
    output.appendChild(el);
    while (output.childElementCount > MAX_LINES && output.firstElementChild) {
        output.removeChild(output.firstElementChild);
    }
    if (atBottom) output.scrollTop = output.scrollHeight;
}

eventBus.on('message', (message?: string | AnsiAwareBuffer, type?: string) => {
    if (message === undefined) return;

    // room.short renders inline in the log flow with the forged location style.
    if (type === 'room.short') {
        const name = textOf(message).trim();
        if (!name) return;
        const el = document.createElement('div');
        el.className = 'locale';
        el.textContent = name;
        appendLine(el);
        return;
    }

    const line = document.createElement('p');
    if (type) line.className = `t-${type.replace(/[^a-z0-9]+/gi, '-')}`;
    if (message instanceof AnsiAwareBuffer) {
        line.appendChild(message.toDom());
    } else {
        line.textContent = message;
    }
    appendLine(line);
});

// --- Vital gems (Char.State) --------------------------------------------------
// Config mirrors the stock CharState DEFAULT_CONFIG; hue + icon are HUD styling.
interface VitalCfg {
    key: string;
    icon: string;
    hue: string;
    max: number;
    default?: number;
    flip?: boolean;
    transform?: (value: number, max: number) => { value: number; max: number };
}

const VITALS: VitalCfg[] = [
    { key: 'hp', icon: 'i-hp', hue: '--blood', max: 6, transform: (v, m) => ({ value: v + 1, max: m + 1 }) },
    { key: 'fatigue', icon: 'i-zm', hue: '--slate', max: 9, flip: true },
    { key: 'stuffed', icon: 'i-hun', hue: '--amber', max: 3, default: 3 },
    { key: 'encumbrance', icon: 'i-obc', hue: '--rust', max: 6, default: 0 },
    { key: 'soaked', icon: 'i-thi', hue: '--steel', max: 3, default: 3 },
    { key: 'mana', icon: 'i-mana', hue: '--mana', max: 8, default: 8 },
    { key: 'improve', icon: 'i-pos', hue: '--gold', max: 15, default: 0 },
    { key: 'form', icon: 'i-for', hue: '--moss', max: 3, default: 3 },
    { key: 'intox', icon: 'i-upi', hue: '--wine', max: 9, default: 0 },
    { key: 'headache', icon: 'i-kac', hue: '--ash', max: 6, default: 0 },
    { key: 'panic', icon: 'i-pan', hue: '--panic', max: 4, default: 0 },
];

const gemsEl = document.getElementById('alt-gems') as HTMLElement;
const gemEls = new Map<string, { gem: HTMLElement; value: HTMLElement }>();

for (const cfg of VITALS) {
    const gem = document.createElement('div');
    gem.className = 'forged gem';
    gem.style.setProperty('--hue', `var(${cfg.hue})`);
    gem.style.display = 'none';
    gem.innerHTML =
        `<span class="niche"><svg viewBox="0 0 20 20"><use href="#${cfg.icon}" stroke="currentColor"/></svg></span>` +
        `<span class="stone"></span>` +
        `<span class="label"><span class="v"></span></span>`;
    gemsEl.appendChild(gem);
    gemEls.set(cfg.key, { gem, value: gem.querySelector('.v') as HTMLElement });
}

const vitalState: Record<string, number> = {};
const charOptions: { form?: number } = {};

function updateGems(): void {
    const alwaysVisible: string[] = (globalStorage.get('uiSettings')?.alwaysVisibleBars) ?? [];
    for (const cfg of VITALS) {
        const raw = vitalState[cfg.key];
        const el = gemEls.get(cfg.key)!;
        const defined = typeof raw === 'number';

        let visible = defined;
        if (cfg.key === 'form' && raw === 0 && (charOptions.form ?? 0) === 0) visible = false;
        if (defined && !alwaysVisible.includes(cfg.key) && cfg.default !== undefined && raw === cfg.default) {
            visible = false;
        }
        if (!visible) { el.gem.style.display = 'none'; continue; }
        el.gem.style.display = '';

        let value = raw;
        let max = cfg.max;
        if (cfg.transform) ({ value, max } = cfg.transform(value, max));
        value = Math.max(0, Math.min(max, value));
        const ratio = max === 0 ? 0 : value / max;
        const reverse = cfg.default === 0 || cfg.flip === true;
        const level = getColorLevel(value, max, reverse, cfg.key === 'hp');
        // "highlight" = the bar hit the opposite extreme from its resting
        // default (fully encumbered, starving, etc.) — this is what pulses.
        const opposite = cfg.default !== undefined ? (cfg.default > 0 ? 0 : max) : null;
        const highlight = opposite !== null && value === opposite;

        el.gem.style.setProperty('--fill', `${Math.round(ratio * 100)}%`);
        el.value.textContent = `${value}/${max}`;
        el.gem.classList.toggle('lvl-warn', level === 'warning');
        el.gem.classList.toggle('lvl-danger', level === 'danger');
        el.gem.classList.toggle('highlight', highlight);
    }
}

eventBus.on('gmcp.char.state', (state) => {
    Object.assign(vitalState, state as Record<string, number>);
    updateGems();
});
eventBus.on('gmcp.char.options', (options) => {
    Object.assign(charOptions, options as { form?: number });
    updateGems();
});

// --- Object list ("W poblizu") -----------------------------------------------
const objectsEl = document.getElementById('alt-objects') as HTMLElement;
const objectsCount = document.getElementById('alt-objects-count') as HTMLElement;

function renderObjects(): void {
    const objects = client.ObjectManager.getObjectsOnLocation() as Array<{
        num: number; desc?: string; hp?: number;
        attack_num?: boolean | number; avatar_target?: boolean; shortcut: string;
    }>;
    objectsCount.textContent = String(objects.length);
    objectsEl.replaceChildren();

    if (objects.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'obj--empty';
        empty.textContent = 'Pustka.';
        objectsEl.appendChild(empty);
        return;
    }

    for (const o of objects) {
        const isPlayer = o.shortcut === '@';
        const isTeam = !isPlayer && !!client.TeamManager?.isInTeam?.(o.desc ?? '');
        const isAttacking = o.attack_num !== false && o.attack_num !== undefined;
        const hasHp = typeof o.hp === 'number';

        const row = document.createElement('div');
        row.className = 'obj';

        const key = document.createElement('span');
        key.className = 'obj__key' + (isPlayer ? ' you' : '');
        // shortcut sits in an <i> so it layers above the ::before bronze diamond.
        const keyGlyph = document.createElement('i');
        keyGlyph.textContent = o.shortcut;
        key.appendChild(keyGlyph);

        const name = document.createElement('span');
        name.className = 'obj__name';
        if (!isPlayer) {
            if (o.avatar_target) name.classList.add('target');
            else if (isTeam) name.classList.add('ally');
            else if (hasHp && isAttacking) name.classList.add('enemy');
            else if (!hasHp) name.classList.add('item');
        }
        name.textContent = o.desc ?? '';

        row.append(key, name);

        if (hasHp) {
            const hp = Math.max(0, Math.min(6, o.hp as number)) + 1; // 1..7
            const bar = document.createElement('span');
            bar.className = 'obj__hp';
            bar.style.setProperty('--hp', `${Math.round((hp / 7) * 100)}%`);
            row.appendChild(bar);
        }
        objectsEl.appendChild(row);
    }
}
// Re-render on the same event set the stock ObjectList uses. Crucially this
// includes 'gmcp.objects.nums' (the object-number packet): leaving a room fires
// nums with the new/empty set, but ObjectManager only emits 'parsedObjects' on a
// *data* packet, so a nums-only clear would otherwise leave a stale list behind.
// gmcp.char.state keeps the player's own HP row current. Coalesce with a
// microtask so a burst of packets renders once, after all handlers have run.
let objectsRenderScheduled = false;
function scheduleRenderObjects(): void {
    if (objectsRenderScheduled) return;
    objectsRenderScheduled = true;
    queueMicrotask(() => {
        objectsRenderScheduled = false;
        renderObjects();
    });
}
client.on('gmcp.objects.nums', scheduleRenderObjects);
client.on('gmcp.objects.data', scheduleRenderObjects);
client.on('gmcp.char.state', scheduleRenderObjects);
renderObjects();

// --- Map (embeds the real client map renderer into #map) ---------------------
const mapLabelEl = document.getElementById('alt-map-label') as HTMLElement;
const mapExitsEl = document.getElementById('alt-map-exits') as HTMLElement;

const DIR_PL: Record<string, string> = {
    north: 'Pln', south: 'Pld', east: 'Wsch', west: 'Zach',
    northeast: 'PnW', northwest: 'PnZ', southeast: 'PdW', southwest: 'PdZ',
    up: 'Gora', down: 'Dol',
};
function renderExits(): void {
    const room = client.Map.currentRoom as { exits?: Record<string, number> } | undefined;
    const exits = room?.exits ? Object.keys(room.exits) : [];
    mapExitsEl.textContent = exits.map(d => DIR_PL[d] ?? d).join(' · ');
}

// Forged map look via the renderer's target-agnostic Style system: the flat,
// muted "modern UI" palette — dark rooms with subtle elevation shadows — which
// sits quietly on the stone backdrop instead of fighting it with the game's
// vivid env colours. setStyle() must be re-applied after reload() since that
// rebuilds the MapRenderer.
const FORGED_MAP_STYLE = DarkModern;

(eventBus as any).on('mapLocationLabel', (label) => {
    if (typeof label === 'string') mapLabelEl.textContent = label;
});
(eventBus as any).on('enterLocation', renderExits);

async function mountMap(): Promise<void> {
    try {
        const [mapData, colors] = await Promise.all([loadMapData(), loadColors()]);
        const { startId, reader, pathFinder } = client.Map.initialize(mapData, colors);
        const embedded = new EmbeddedMap(reader, startId);
        (embedded as unknown as { pathFinder: unknown }).pathFinder = pathFinder;

        // Force the forged look on the shared renderer Settings, disregarding the
        // user's stock map client settings (roomShape, background, colors, marker):
        // the alt UI has its own parchment-on-void aesthetic and must not inherit
        // the stock client's map appearance. We mutate the retained `settings`
        // object (not a copy), so these persist across reload()'s renderer rebuild.
        const s = embedded.settings;
        s.roomShape = 'roundedRectangle';       // rounded rooms, per design
        s.backgroundColor = 'transparent';      // void/backdrop shows through
        s.borders = true;
        s.lineColor = 'rgba(184, 150, 90, 0.42)'; // dim bronze exit lines
        s.gridEnabled = false;
        s.emboss = false;
        s.transparentLabels = true;
        s.labelRenderMode = 'data';
        // Current-room marker. NOTE: DarkModern recolours the marker (stroke → a
        // faint white, fill → a muted tone), so we lean on a bright, light input
        // fill (maps to a lighter muted output), a higher fill alpha (alpha is
        // preserved by the style), and a slightly larger size — that's what keeps
        // "here" visible against the muted dark rooms. A proper fix (a style layer
        // after DarkModern that forces the marker paint) is noted for later.
        s.playerMarker.strokeColor = '#ffe9a8';
        s.playerMarker.strokeAlpha = 1;
        s.playerMarker.fillColor = '#ffe9a8';
        s.playerMarker.fillAlpha = 0.55;
        s.playerMarker.strokeWidth = 0.12;
        s.playerMarker.sizeFactor = 1.5;
        s.playerMarker.dashEnabled = false;
        s.playerMarker.matchRoomShape = true;
        embedded.renderer.setStyle(FORGED_MAP_STYLE);
        embedded.refreshRender();
        embedded.refresh();
        (globalThis as unknown as { embedded: unknown }).embedded = embedded;
        subscribeToMapData((newMapData) => {
            if (!newMapData) return;
            const r = client.Map.initialize(newMapData, colors);
            embedded.reload(r.reader);
            embedded.renderer.setStyle(FORGED_MAP_STYLE); // reload() rebuilt the renderer
            (embedded as unknown as { pathFinder: unknown }).pathFinder = r.pathFinder;
        }, { emitInitial: false });
        renderExits();
    } catch (err) {
        console.error('[alt-ui] map mount failed', err);
    }
}
void mountMap();

// --- Connection status --------------------------------------------------------
const status = document.getElementById('alt-status') as HTMLElement;
const connectKnot = document.getElementById('alt-connect') as HTMLElement;
const setConnected = (connected: boolean) => {
    status.textContent = connected ? 'Polaczony' : 'Polacz';
    status.classList.toggle('connected', connected);
    connectKnot.classList.toggle('connected', connected);
    connectKnot.title = connected ? 'Polaczony' : 'Polacz';
};
eventBus.on('client.connect', () => setConnected(true));
eventBus.on('client.disconnect', () => setConnected(false));
const connect = () => mudClient.connect();
status.addEventListener('click', connect);
connectKnot.addEventListener('click', connect);

// --- Command input ------------------------------------------------------------
const input = document.getElementById('alt-input') as HTMLInputElement;
input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    const command = input.value;
    input.value = '';
    void client.sendCommand(command, true, undefined, false, true);
});
input.focus();
