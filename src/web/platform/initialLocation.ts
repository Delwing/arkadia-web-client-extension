/**
 * A shared location link (`?locationId=123`, the "Kod QR lokacji" menu entry)
 * puts the map on that room once the game reports the first room, then drops the
 * parameter from the address so a reload does not jump there again.
 */
export function applyInitialLocation(
    client: {
        Map: { setMapRoomById(id: number): void };
        on(event: 'gmcp.room.info', listener: () => void): () => void;
    },
    win: Pick<Window, 'location' | 'history'> = window,
): void {
    const locationParam = new URLSearchParams(win.location.search).get('locationId');
    const initialLocationId = locationParam ? parseInt(locationParam) : NaN;
    if (isNaN(initialLocationId)) {
        return;
    }
    const unsubscribe = client.on('gmcp.room.info', () => {
        client.Map.setMapRoomById(initialLocationId);

        const params = new URLSearchParams(win.location.search);
        params.delete('locationId');
        const base = win.location.origin + win.location.pathname;
        const rest = params.toString();
        win.history.replaceState({}, '', rest ? `${base}?${rest}` : base);

        unsubscribe();
    });
}
