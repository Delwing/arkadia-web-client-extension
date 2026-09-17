import initMove, { extractFollowDirection } from '@client/scripts/move';

function makeHarness(followMove: (direction: string, full?: string) => string | undefined) {
    const triggers: { pattern: RegExp | RegExp[]; cb: (line: { text: string }, matches: RegExpMatchArray) => unknown }[] = [];
    const Map = { followMove: jest.fn(followMove), refresh: jest.fn() };
    const client = {
        Map,
        Triggers: {
            registerTrigger: (pattern: RegExp | RegExp[], cb: any) => {
                triggers.push({ pattern, cb });
                return { registerChild: () => ({}) };
            },
        },
    };
    initMove(client as never);

    function feed(text: string) {
        for (const { pattern, cb } of triggers) {
            const regex = Array.isArray(pattern) ? pattern[0] : pattern;
            const matches = regex.exec(text);
            if (matches) cb({ text }, matches);
        }
    }

    return { feed, Map };
}

describe('extractFollowDirection', () => {
    test.each([
        ['Chorem na zachod', 'zachod'],
        ['Chorem na polnocny-zachod, brodzac w wodzie morskiej', 'polnocny-zachod'],
        ['Chorem na zachod, wchodzac na plycizne', 'zachod'],
        ['Chorem na wschod, wychodzac na brzeg', 'wschod'],
        ['Chorem na gore', 'gore'],
    ])('%s -> %s', (text, expected) => {
        expect(extractFollowDirection(text)).toBe(expected);
    });

    test('ignores non-directional follow text', () => {
        expect(extractFollowDirection('woznica w lesna gestwine')).toBeUndefined();
        expect(extractFollowDirection('Chorem na brzeg')).toBeUndefined();
    });
});

describe('follow trigger', () => {
    test('follows the compass direction once when terrain flavour trails it', () => {
        const h = makeHarness(() => undefined);
        h.feed('Wraz z Pablem i Vesper podazasz za Chorem na zachod, brodzac w wodzie morskiej.');
        expect(h.Map.followMove).toHaveBeenCalledTimes(1);
        expect(h.Map.followMove).toHaveBeenCalledWith('zachod', 'Chorem na zachod, brodzac w wodzie morskiej');
    });

    test('falls back to token scanning without a compass direction', () => {
        const h = makeHarness((dir) => (dir === 'gestwine' ? 'gestwina' : undefined));
        h.feed('Podazasz za woznica w lesna gestwine.');
        expect(h.Map.followMove).toHaveBeenCalledWith('gestwine', 'woznica w lesna gestwine');
    });
});
