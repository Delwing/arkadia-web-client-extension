import { useSharedLocationLink } from "./locationShare";

/** The QR code of the room {@link shareLocation} was last asked for. */
export function LocationShareQr() {
    const link = useSharedLocationLink();
    if (!link) return null;
    return (
        <img
            id="location-qr-image"
            alt="QR code"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(link)}`}
        />
    );
}
