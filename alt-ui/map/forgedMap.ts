import type Client from '@client/Client';
import { EmbeddedMap } from '@web/embed';
import { setEmbeddedMap } from '@web/embedRegistry';
import { loadMapData, loadColors, subscribeToMapData } from '@web/mapDataLoader';
import { DarkModern } from 'mudlet-map-renderer';

// Forged map look via the renderer's target-agnostic Style system: the flat,
// muted "modern UI" palette — dark rooms with subtle elevation shadows — which
// sits quietly on the stone backdrop instead of fighting it with the game's
// vivid env colours. setStyle() must be re-applied after reload() since that
// rebuilds the MapRenderer.
const FORGED_MAP_STYLE = DarkModern;

const DIR_PL: Record<string, string> = {
    north: 'Pln', south: 'Pld', east: 'Wsch', west: 'Zach',
    northeast: 'PnW', northwest: 'PnZ', southeast: 'PdW', southwest: 'PdZ',
    up: 'Gora', down: 'Dol',
};

/** Current room's exits, localized and joined for the map panel footer. */
export function computeExits(client: Client): string {
    const room = client.Map.currentRoom as { exits?: Record<string, number> } | undefined;
    const exits = room?.exits ? Object.keys(room.exits) : [];
    return exits.map(d => DIR_PL[d] ?? d).join(' · ');
}

/** Force the forged look on a freshly built renderer's Settings. */
function applyForgedSettings(embedded: EmbeddedMap): void {
    // Disregard the user's stock map client settings; the alt UI has its own
    // parchment-on-void aesthetic. Mutating the retained `settings` object means
    // these persist across reload()'s renderer rebuild.
    const s = embedded.settings;
    s.roomShape = 'roundedRectangle';       // rounded rooms, per design
    s.backgroundColor = 'transparent';      // void/backdrop shows through
    s.borders = true;
    s.lineColor = 'rgba(184, 150, 90, 0.42)'; // dim bronze exit lines
    s.gridEnabled = false;
    s.emboss = false;
    s.transparentLabels = true;
    s.labelRenderMode = 'data';
    // Current-room marker. DarkModern recolours the marker, so we lean on a
    // bright, light input fill (maps to a lighter muted output), a higher fill
    // alpha (alpha is preserved by the style), and a slightly larger size.
    s.playerMarker.strokeColor = '#ffe9a8';
    s.playerMarker.strokeAlpha = 1;
    s.playerMarker.fillColor = '#ffe9a8';
    s.playerMarker.fillAlpha = 0.55;
    s.playerMarker.strokeWidth = 0.12;
    s.playerMarker.sizeFactor = 1.5;
    s.playerMarker.dashEnabled = false;
    s.playerMarker.matchRoomShape = true;
}

/**
 * Mount the real client map renderer into the hard-coded `#map` element and keep
 * it styled across map-data reloads. Call once, after `#map` is in the DOM.
 */
export async function mountForgedMap(client: Client): Promise<void> {
    try {
        const [mapData, colors] = await Promise.all([loadMapData(), loadColors()]);
        const { startId, reader, pathFinder } = client.Map.initialize(mapData, colors);
        const embedded = new EmbeddedMap(reader, startId);
        embedded.pathFinder = pathFinder;

        applyForgedSettings(embedded);
        embedded.renderer.setStyle(FORGED_MAP_STYLE);
        embedded.refreshRender();
        embedded.refresh();
        setEmbeddedMap(embedded);

        subscribeToMapData((newMapData) => {
            if (!newMapData) return;
            const r = client.Map.initialize(newMapData, colors);
            embedded.reload(r.reader);
            embedded.renderer.setStyle(FORGED_MAP_STYLE); // reload() rebuilt the renderer
            embedded.pathFinder = r.pathFinder;
        }, { emitInitial: false });
    } catch (err) {
        console.error('[alt-ui] map mount failed', err);
    }
}
