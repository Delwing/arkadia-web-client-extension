/**
 * Splits a game-rendered name list ("A, B i C") into its members and strips the
 * brackets the game puts around introduced names ("[Vesper]").
 *
 * Shared by TeamManager (team rosters) and the cover tracker (attacker lists on
 * "... przed ciosami <A>, <B> i <C>." lines) so both stay on one splitter.
 */
export function parseNames(list: string): string[] {
    return list
        .split(/,| i /)
        .map(s => s.trim().replace(/^\[|]$/g, ''))
        .filter(Boolean);
}

export default parseNames;
