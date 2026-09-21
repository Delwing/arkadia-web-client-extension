import type { UiSettings } from "../../uiSettingsCore";
import { defaultUiSettings } from "../../defaultUiSettings";
import { CheckboxRow, ColorField, NumberField, RangeField, SelectField, SettingsSection } from "../fields";
import MapPreviewCanvas from "../MapPreviewCanvas";

// Highlights take their colour per-call at runtime; use a representative sample for the preview.
const HIGHLIGHT_PREVIEW_COLOR = '#ffcc00';

interface MapSectionsProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
    mapVersion: string;
    refreshing: boolean;
    onRefreshMap: () => void;
    explorationStats: string;
}

function MapSections({ draft, update, mapVersion, refreshing, onRefreshMap, explorationStats }: MapSectionsProps) {
    const refreshBadge = (
        <button type="button" id="ui-map-refresh-btn" className="ui-map-version-badge" title="Kliknij, aby odświeżyć dane mapy" disabled={refreshing} onClick={onRefreshMap}>
            <span className="ui-map-refresh-icon">{'↻'}</span>
            <span id="ui-map-version">{mapVersion}</span>
        </button>
    );

    return (
        <>
            <SettingsSection title="Mapa" headerExtra={refreshBadge}>
                <NumberField id="ui-map-scale" label="Powiększenie mapy" settingKey="mapScale" value={draft.mapScale} step={0.05} min={0.05} onChange={(n) => update({ mapScale: n })} />
                <NumberField id="ui-map-height" label="Wysokość mapy (vh)" settingKey="mapHeight" value={draft.mapHeight} step={1} onChange={(n) => update({ mapHeight: n })} />
                <SelectField id="ui-map-position" label="Położenie mapy" settingKey="mapPosition" value={draft.mapPosition} onChange={(v) => update({ mapPosition: v as UiSettings['mapPosition'] })}>
                    <option value="top-overlay">Góra (nakładka)</option>
                    <option value="bottom-overlay">Dół (nakładka)</option>
                    <option value="right-overlay">Prawa (nakładka)</option>
                    <option value="left-overlay">Lewa (nakładka)</option>
                    <option value="top">Góra</option>
                    <option value="bottom">Dół</option>
                    <option value="right">Prawa</option>
                    <option value="left">Lewa</option>
                </SelectField>
                <SelectField id="ui-label-render-mode" label="Tryb renderowania etykiet" value={draft.labelRenderMode} disabled={draft.transparentLabels} onChange={(v) => update({ labelRenderMode: v as UiSettings['labelRenderMode'] })}>
                    <option value="image">Obraz</option>
                    <option value="data">Dane</option>
                    <option value="none">Brak</option>
                </SelectField>
                <CheckboxRow id="ui-instant-move" label="Natychmiastowe przechodzenie po mapie" checked={draft.instantMove} onChange={(v) => update({ instantMove: v })} />
                <CheckboxRow id="ui-highlight-current-room" label="Podświetl bieżące pomieszczenie" checked={draft.highlightCurrentRoom} onChange={(v) => update({ highlightCurrentRoom: v })} />
                <CheckboxRow
                    id="ui-exploration-mode"
                    label={<>Tryb eksploracji mapy <span id="ui-exploration-stats" className="settings-inline-note">{explorationStats}</span></>}
                    checked={draft.explorationMode}
                    onChange={(v) => update({ explorationMode: v })}
                />
                <CheckboxRow
                    id="ui-transparent-labels"
                    label="Przezroczyste etykiety (wymusza tryb danych)"
                    checked={draft.transparentLabels}
                    onChange={(v) => update(v ? { transparentLabels: true, labelRenderMode: 'data' } : { transparentLabels: false })}
                />
                <SelectField id="ui-map-pathfinding-algorithm" label="Algorytm wyszukiwania drogi" value={draft.pathFindingAlgorithm} onChange={(v) => update({ pathFindingAlgorithm: v as UiSettings['pathFindingAlgorithm'] })}>
                    <option value="dijkstra">Dijkstra</option>
                    <option value="astar">A*</option>
                </SelectField>
            </SettingsSection>

            <SettingsSection title="Pomieszczenia i linie">
                <RangeField id="ui-map-room-size" label="Rozmiar pomieszczeń" value={draft.mapRoomSize} min={0.1} max={1.5} step={0.01} onChange={(n) => update({ mapRoomSize: n })} />
                <RangeField id="ui-map-line-width" label="Szerokość linii" value={draft.mapLineWidth} min={0.010} max={0.1} step={0.001} onChange={(n) => update({ mapLineWidth: n })} />
                <SelectField id="ui-map-room-shape" label="Kształt pomieszczeń" value={draft.mapRoomShape} onChange={(v) => update({ mapRoomShape: v as UiSettings['mapRoomShape'] })}>
                    <option value="rectangle">Prostokąt</option>
                    <option value="roundedRectangle">Zaokrąglony prostokąt</option>
                    <option value="circle">Koło</option>
                </SelectField>
                <ColorField id="ui-map-background-color" label="Kolor tła mapy" value={draft.mapBackgroundColor} onChange={(v) => update({ mapBackgroundColor: v })} onReset={() => update({ mapBackgroundColor: defaultUiSettings.mapBackgroundColor })} />
                <ColorField id="ui-map-line-color" label="Kolor linii" value={draft.mapLineColor} onChange={(v) => update({ mapLineColor: v })} onReset={() => update({ mapLineColor: defaultUiSettings.mapLineColor })} />
            </SettingsSection>

            <SettingsSection title="Marker gracza">
                <ColorField id="ui-map-player-marker-stroke-color" label="Kolor obramowania markera gracza" value={draft.mapPlayerMarkerStrokeColor} onChange={(v) => update({ mapPlayerMarkerStrokeColor: v })} />
                <ColorField id="ui-map-player-marker-fill-color" label="Kolor wypełnienia markera gracza" value={draft.mapPlayerMarkerFillColor} onChange={(v) => update({ mapPlayerMarkerFillColor: v })} />
                <RangeField id="ui-map-player-marker-stroke-alpha" label="Przezroczystość obramowania" value={draft.mapPlayerMarkerStrokeAlpha} min={0} max={1} step={0.01} onChange={(n) => update({ mapPlayerMarkerStrokeAlpha: n })} />
                <RangeField id="ui-map-player-marker-fill-alpha" label="Przezroczystość wypełnienia" value={draft.mapPlayerMarkerFillAlpha} min={0} max={1} step={0.01} onChange={(n) => update({ mapPlayerMarkerFillAlpha: n })} />
                <RangeField id="ui-map-player-marker-stroke-width" label="Grubość obramowania markera" value={draft.mapPlayerMarkerStrokeWidth} min={0.01} max={0.3} step={0.01} onChange={(n) => update({ mapPlayerMarkerStrokeWidth: n })} />
                <RangeField id="ui-map-player-marker-size-factor" label="Mnożnik rozmiaru markera" value={draft.mapPlayerMarkerSizeFactor} min={0.5} max={3} step={0.1} onChange={(n) => update({ mapPlayerMarkerSizeFactor: n })} />
                <CheckboxRow id="ui-map-player-marker-dash-enabled" label="Przerywane obramowanie markera" checked={draft.mapPlayerMarkerDashEnabled} onChange={(v) => update({ mapPlayerMarkerDashEnabled: v })} />
                <MapPreviewCanvas
                    id="ui-map-preview-canvas"
                    roomSize={draft.mapRoomSize}
                    lineWidth={draft.mapLineWidth}
                    roomShape={draft.mapRoomShape}
                    strokeColor={draft.mapPlayerMarkerStrokeColor}
                    fillColor={draft.mapPlayerMarkerFillColor}
                    strokeAlpha={draft.mapPlayerMarkerStrokeAlpha}
                    fillAlpha={draft.mapPlayerMarkerFillAlpha}
                    strokeWidth={draft.mapPlayerMarkerStrokeWidth}
                    sizeFactor={draft.mapPlayerMarkerSizeFactor}
                    dashEnabled={draft.mapPlayerMarkerDashEnabled}
                />
            </SettingsSection>

            <SettingsSection title="Podświetlenie pomieszczeń">
                <p className="popup-field__hint">Styl pierścieni rysowanych wokół wyróżnionych pomieszczeń (np. cel podróży, notatki). Kolor jest dobierany automatycznie dla każdego wyróżnienia.</p>
                <SelectField id="ui-map-highlight-shape" label="Kształt podświetlenia" value={draft.mapHighlightShape} onChange={(v) => update({ mapHighlightShape: v as UiSettings['mapHighlightShape'] })}>
                    <option value="match">Jak kształt pomieszczenia</option>
                    <option value="rectangle">Prostokąt</option>
                    <option value="roundedRectangle">Zaokrąglony prostokąt</option>
                    <option value="circle">Koło</option>
                </SelectField>
                <RangeField id="ui-map-highlight-stroke-alpha" label="Przezroczystość obramowania" value={draft.mapHighlightStrokeAlpha} min={0} max={1} step={0.01} onChange={(n) => update({ mapHighlightStrokeAlpha: n })} />
                <RangeField id="ui-map-highlight-fill-alpha" label="Przezroczystość wypełnienia" value={draft.mapHighlightFillAlpha} min={0} max={1} step={0.01} onChange={(n) => update({ mapHighlightFillAlpha: n })} />
                <RangeField id="ui-map-highlight-stroke-width" label="Grubość obramowania" value={draft.mapHighlightStrokeWidth} min={0.01} max={0.3} step={0.01} onChange={(n) => update({ mapHighlightStrokeWidth: n })} />
                <RangeField id="ui-map-highlight-size-factor" label="Mnożnik rozmiaru" value={draft.mapHighlightSizeFactor} min={0.5} max={3} step={0.025} onChange={(n) => update({ mapHighlightSizeFactor: n })} />
                <CheckboxRow id="ui-map-highlight-dash-enabled" label="Przerywane obramowanie" checked={draft.mapHighlightDashEnabled} onChange={(v) => update({ mapHighlightDashEnabled: v })} />
                <MapPreviewCanvas
                    id="ui-map-highlight-preview-canvas"
                    roomSize={draft.mapRoomSize}
                    lineWidth={draft.mapLineWidth}
                    roomShape={draft.mapRoomShape}
                    markerShape={draft.mapHighlightShape === 'match' ? draft.mapRoomShape : draft.mapHighlightShape}
                    strokeColor={HIGHLIGHT_PREVIEW_COLOR}
                    fillColor={HIGHLIGHT_PREVIEW_COLOR}
                    strokeAlpha={draft.mapHighlightStrokeAlpha}
                    fillAlpha={draft.mapHighlightFillAlpha}
                    strokeWidth={draft.mapHighlightStrokeWidth}
                    sizeFactor={draft.mapHighlightSizeFactor}
                    dashEnabled={draft.mapHighlightDashEnabled}
                />
            </SettingsSection>
        </>
    );
}

export default MapSections;
