import type { MapReader, PathFinder } from 'mudlet-map-renderer';
import { EmbeddedMap } from '../embed';
import {
    clearEmbeddedMapBridge,
    setEmbeddedMapBridge,
} from '@client/src/runtime/embeddedMapBridge';

let embeddedMapInstance: EmbeddedMap | null = null;
type EmbeddedMapSubscriber = (map: EmbeddedMap | null) => void;
const subscribers = new Set<EmbeddedMapSubscriber>();

function notifySubscribers() {
    subscribers.forEach(listener => {
        try {
            listener(embeddedMapInstance);
        } catch (err) {
            console.error('mapProvider subscriber failed', err);
        }
    });
}

function assignEmbeddedMap(map: EmbeddedMap | null) {
    embeddedMapInstance = map;
    if (map) {
        setEmbeddedMapBridge(map);
    } else {
        clearEmbeddedMapBridge();
    }
    notifySubscribers();
}

export function initializeEmbeddedMap({
    reader,
    pathFinder,
    startId,
}: {
    reader: MapReader;
    pathFinder: PathFinder;
    startId?: number;
}): EmbeddedMap {
    const map = new EmbeddedMap(reader, pathFinder, startId);
    assignEmbeddedMap(map);
    return map;
}

export function setEmbeddedMap(map: EmbeddedMap | null) {
    assignEmbeddedMap(map);
}

export function getEmbeddedMap(): EmbeddedMap {
    if (!embeddedMapInstance) {
        throw new Error('Embedded map has not been initialised.');
    }
    return embeddedMapInstance;
}

export function peekEmbeddedMap(): EmbeddedMap | null {
    return embeddedMapInstance;
}

export function subscribeEmbeddedMap(listener: EmbeddedMapSubscriber): () => void {
    subscribers.add(listener);
    listener(embeddedMapInstance);
    return () => {
        subscribers.delete(listener);
    };
}

export function clearEmbeddedMap() {
    assignEmbeddedMap(null);
}
