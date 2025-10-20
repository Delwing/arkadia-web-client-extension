export type LabelRenderModeOption = 'image' | 'data';

export interface EmbeddedMapApi {
    setZoom(zoom: number): void;
    refresh(): void;
    setExplorationMode(on: boolean): void;
    setTransparentLabels(on: boolean): void;
    setLabelRenderMode(mode: LabelRenderModeOption): void;
    setInstantMove(on: boolean): void;
    setHighlightCurrentRoom(on: boolean): void;
    getVisitedCount(): number;
    getRoomCount(): number;
    getDestinations(): readonly number[];
    getPrimaryDestination(): number | null;
}

type EmbeddedMapSubscriber = (map: EmbeddedMapApi | null) => void;

let embeddedMapInstance: EmbeddedMapApi | null = null;
const subscribers = new Set<EmbeddedMapSubscriber>();

function notifySubscribers() {
    subscribers.forEach(listener => {
        try {
            listener(embeddedMapInstance);
        } catch (err) {
            console.error('embeddedMapBridge subscriber failed', err);
        }
    });
}

export function setEmbeddedMapBridge(map: EmbeddedMapApi | null) {
    embeddedMapInstance = map;
    notifySubscribers();
}

export function clearEmbeddedMapBridge() {
    setEmbeddedMapBridge(null);
}

export function getEmbeddedMap(): EmbeddedMapApi {
    if (!embeddedMapInstance) {
        throw new Error('Embedded map has not been initialised.');
    }
    return embeddedMapInstance;
}

export function peekEmbeddedMap(): EmbeddedMapApi | null {
    return embeddedMapInstance;
}

export function subscribeEmbeddedMap(listener: EmbeddedMapSubscriber): () => void {
    subscribers.add(listener);
    listener(embeddedMapInstance);
    return () => {
        subscribers.delete(listener);
    };
}
