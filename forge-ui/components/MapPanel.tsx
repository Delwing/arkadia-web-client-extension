import { useEffect, useRef, useState } from 'react';
import { useClient } from '../client/ClientContext';
import { useClientEvent } from '../hooks/useClientEvent';
import { mountForgedMap, computeExits } from '../map/forgedMap';
import Panel from './Panel';

/**
 * Hosts the real client map renderer. The renderer mounts imperatively into the
 * hard-coded `#map` element after it exists; the header label and exits footer
 * are driven from React state via map events.
 */
export default function MapPanel() {
    const client = useClient();
    const [label, setLabel] = useState('');
    const [exits, setExits] = useState('');
    const mountedRef = useRef(false);

    useEffect(() => {
        if (mountedRef.current) return; // guard StrictMode / re-runs: mount once
        mountedRef.current = true;
        void mountForgedMap(client).then(() => setExits(computeExits(client)));
    }, [client]);

    useClientEvent('mapLocationLabel', (l) => {
        if (typeof l === 'string') setLabel(l);
    });
    useClientEvent('enterLocation', () => setExits(computeExits(client)));

    return (
        <Panel title="Mapa" className="panel--map" meta={label} metaId="alt-map-label">
            <div className="map"><div id="map" /></div>
            <div className="map__exits" id="alt-map-exits">{exits}</div>
        </Panel>
    );
}
