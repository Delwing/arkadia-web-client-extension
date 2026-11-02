import { getLongDir, getShortDir } from "@shared/map/directions.ts";

/** Short directions the pad has a button for. */
export const PAD_DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'u', 'd'];

/** Exits as short directions, and the named exits that are not directions. */
export function splitExits(exits: string[]): { directions: Set<string>; named: string[] } {
    const directions = new Set<string>();
    const named: string[] = [];
    for (const exit of exits) {
        const short = getShortDir(getLongDir(exit));
        if (PAD_DIRECTIONS.includes(short)) directions.add(short);
        else named.push(exit);
    }
    return { directions, named };
}
