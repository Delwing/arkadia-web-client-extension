const MAP_ZOOM_DECIMALS = 2;

function roundToDecimals(value: number, decimals: number): number {
    if (!Number.isFinite(value)) {
        return 0;
    }
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

export function roundMapZoom(value: number): number {
    return roundToDecimals(value, MAP_ZOOM_DECIMALS);
}

export { MAP_ZOOM_DECIMALS };
