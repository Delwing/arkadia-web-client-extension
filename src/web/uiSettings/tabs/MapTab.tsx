import type { UiSettings } from "../../uiSettingsCore";
import { defaultUiSettings } from "../../defaultUiSettings";
import { CheckboxRow, ColorField, NumberField, RangeField, SelectField, SettingsSection } from "../fields";
import MapPreviewCanvas from "../MapPreviewCanvas";

interface MapTabProps {
    draft: UiSettings;
    update: (patch: Partial<UiSettings>) => void;
    mapVersion: string;
    refreshing: boolean;
    onRefreshMap: () => void;
    explorationStats: string;
}

function MapTab({ draft, update, mapVersion, refreshing, onRefreshMap, explorationStats }: MapTabProps) {
    const refreshBadge = (
        <button type="button" id="ui-map-refresh-btn" className="ui-map-version-badge" title="Kliknij, aby odświeżyć dane mapy" disabled={refreshing} onClick={onRefreshMap}>
            <span className="ui-map-refresh-icon">{'↻'}</span>
            <span id="ui-map-version">{mapVersion}</span>
        </button>
    );

    return (
        <>
            <SettingsSection title="Mapa" headerExtra={refreshBadge}>
                <NumberField id="ui-map-scale" label="Powiększenie mapy" value={draft.mapScale} step={0.05} min={0.05} onChange={(n) => update({ mapScale: n })} />
                <NumberField id="ui-map-height" label="Wysokość mapy (vh)" value={draft.mapHeight} step={1} onChange={(n) => update({ mapHeight: n })} />
                <SelectField id="ui-map-position" label="Położenie mapy" value={draft.mapPosition} onChange={(v) => update({ mapPosition: v as UiSettings['mapPosition'] })}>
                    <option value="top-overlay">Góra (nakładka)</option>
                    <option value="bottom-overlay">Dół (nakładka)</option>
                    <option value="right-overlay">Prawa (nakładka)</option>
                    <option value="left-overlay">Lewa (nakładka)</option>
                    <option value="top">Góra</option>
                    <option value="bottom">Dół</option>
                    <option value="right">Prawa</option>
                    <option value="left">Lewa</option>
                </SelectField>
                <div>
                    <label className="form-label" htmlFor="ui-label-render-mode">Tryb renderowania etykiet</label>
                    <select id="ui-label-render-mode" className="form-select" value={draft.labelRenderMode} disabled={draft.transparentLabels} onChange={(e) => update({ labelRenderMode: e.target.value as UiSettings['labelRenderMode'] })}>
                        <option value="image">Obraz</option>
                        <option value="data">Dane</option>
                        <option value="none">Brak</option>
                    </select>
                </div>
                <CheckboxRow id="ui-instant-move" label="Natychmiastowe przechodzenie po mapie" checked={draft.instantMove} onChange={(v) => update({ instantMove: v })} />
                <CheckboxRow id="ui-highlight-current-room" label="Podświetl bieżące pomieszczenie" checked={draft.highlightCurrentRoom} onChange={(v) => update({ highlightCurrentRoom: v })} />
                <CheckboxRow
                    id="ui-exploration-mode"
                    label={<>Tryb eksploracji mapy <span id="ui-exploration-stats" className="ms-1 text-muted">{explorationStats}</span></>}
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
                <div>
                    <label className="form-label" htmlFor="ui-map-player-marker-stroke-color">Kolor obramowania markera gracza</label>
                    <input id="ui-map-player-marker-stroke-color" type="color" className="form-control form-control-color" value={draft.mapPlayerMarkerStrokeColor} onChange={(e) => update({ mapPlayerMarkerStrokeColor: e.target.value })} />
                </div>
                <div>
                    <label className="form-label" htmlFor="ui-map-player-marker-fill-color">Kolor wypełnienia markera gracza</label>
                    <input id="ui-map-player-marker-fill-color" type="color" className="form-control form-control-color" value={draft.mapPlayerMarkerFillColor} onChange={(e) => update({ mapPlayerMarkerFillColor: e.target.value })} />
                </div>
                <RangeField id="ui-map-player-marker-stroke-alpha" label="Przezroczystość obramowania" value={draft.mapPlayerMarkerStrokeAlpha} min={0} max={1} step={0.01} onChange={(n) => update({ mapPlayerMarkerStrokeAlpha: n })} />
                <RangeField id="ui-map-player-marker-fill-alpha" label="Przezroczystość wypełnienia" value={draft.mapPlayerMarkerFillAlpha} min={0} max={1} step={0.01} onChange={(n) => update({ mapPlayerMarkerFillAlpha: n })} />
                <RangeField id="ui-map-player-marker-stroke-width" label="Grubość obramowania markera" value={draft.mapPlayerMarkerStrokeWidth} min={0.01} max={0.3} step={0.01} onChange={(n) => update({ mapPlayerMarkerStrokeWidth: n })} />
                <RangeField id="ui-map-player-marker-size-factor" label="Mnożnik rozmiaru markera" value={draft.mapPlayerMarkerSizeFactor} min={0.5} max={3} step={0.1} onChange={(n) => update({ mapPlayerMarkerSizeFactor: n })} />
                <CheckboxRow id="ui-map-player-marker-dash-enabled" label="Przerywane obramowanie markera" checked={draft.mapPlayerMarkerDashEnabled} onChange={(v) => update({ mapPlayerMarkerDashEnabled: v })} />
                <MapPreviewCanvas
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
        </>
    );
}

export default MapTab;
