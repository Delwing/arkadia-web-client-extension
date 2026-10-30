import { useSyncExternalStore } from "react";
import { openWindow } from "../modals/pageWindows";

/*
Kod QR lokacji (the ⋯ menu): a link that opens the map on a room, shown as a QR
code in its window (LocationShareQr).
*/

let link: string | null = null;
const listeners = new Set<() => void>();

/** The page's own address with `?locationId=` set to the room. */
export function locationLink(roomId: number, location: Pick<Location, "origin" | "pathname"> = window.location): string {
    const url = new URL(location.origin + location.pathname);
    url.searchParams.set("locationId", roomId.toString());
    return url.toString();
}

/** Show the room's QR code; nothing while no room is known. */
export function shareLocation(roomId: number | undefined | null): void {
    if (!roomId) return;
    link = locationLink(roomId);
    listeners.forEach((listener) => listener());
    openWindow("locationShare");
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}

/** The link being shared, or null before the first share. */
export function useSharedLocationLink(): string | null {
    return useSyncExternalStore(subscribe, () => link);
}
