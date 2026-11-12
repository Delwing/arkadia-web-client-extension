export type CoinMetal = 'mithril' | 'gold' | 'silver' | 'copper';

// "z.ot" so both "zlote" and the Polish spelling match while the pattern stays ASCII
const METALS: [CoinMetal, RegExp][] = [
    ['mithril', /mit(?:h)?ryl/i],
    ['gold', /z.ot/i],
    ['silver', /srebr/i],
    ['copper', /miedzian/i],
];

/** Which metal a coin item is made of, from its name ("trzy zlote monety") */
export function coinMetal(name: string): CoinMetal | null {
    return METALS.find(([, re]) => re.test(name))?.[0] ?? null;
}
