export const polishToEnglish: Record<string, string> = {
    "polnoc": "north",
    "poludnie": "south",
    "wschod": "east",
    "zachod": "west",
    "polnocny-wschod": "northeast",
    "polnocny-zachod": "northwest",
    "poludniowy-wschod": "southeast",
    "poludniowy-zachod": "southwest",
    "dol": "down",
    "gora": "up",
    "gore": "up",
};

export const longToShort: Record<string, string> = {
    north: "n",
    south: "s",
    east: "e",
    west: "w",
    northeast: "ne",
    northwest: "nw",
    southeast: "se",
    southwest: "sw",
    up: "u",
    down: "d",
};

const shortToLong: Record<string, string> = {
    n: "north",
    s: "south",
    e: "east",
    w: "west",
    ne: "northeast",
    nw: "northwest",
    se: "southeast",
    sw: "southwest",
    u: "up",
    d: "down",
};

export function getLongDir(dir: string): string {
    const lower = dir.toLowerCase();
    return polishToEnglish[lower] ?? shortToLong[lower] ?? lower;
}

export function getShortDir(dir: string): string {
    const long = getLongDir(dir);
    return longToShort[long] ?? dir;
}

