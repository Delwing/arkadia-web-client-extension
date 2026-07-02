import initFollowSpecialExits from '@client/scripts/followSpecialExits';

interface RegisteredTrigger {
    pattern: string | RegExp;
    cb: (line: { text: string }, matches: RegExpMatchArray, type: string, original: string) => unknown;
}

function makeHarness(opts: { leader?: string; roomId?: number; drawWeaponCommand?: string } = {}) {
    const triggers: RegisteredTrigger[] = [];
    const set = jest.fn();
    const events: { type: string; detail: unknown }[] = [];

    const client = {
        drawWeaponCommand: opts.drawWeaponCommand ?? 'dobadz',
        Map: {currentRoom: opts.roomId !== undefined ? {id: opts.roomId} : undefined},
        TeamManager: {getLeader: () => opts.leader},
        FunctionalBind: {set},
        Triggers: {
            registerTrigger: (pattern: string | RegExp, cb: RegisteredTrigger['cb']) => {
                triggers.push({pattern, cb});
                return {} as never;
            },
        },
        sendEvent: (type: string, detail: unknown) => {
            events.push({type, detail});
        },
    };

    initFollowSpecialExits(client as never);

    function feed(text: string) {
        for (const {pattern, cb} of triggers) {
            let matches: RegExpMatchArray | null = null;
            if (typeof pattern === 'string') {
                if (text.includes(pattern)) matches = [text] as unknown as RegExpMatchArray;
            } else {
                matches = pattern.exec(text);
            }
            if (matches) cb({text}, matches, 'text', text);
        }
    }

    return {feed, set, events};
}

describe('followSpecialExits', () => {
    test('binds the follow command when the leader takes a special exit', () => {
        const h = makeHarness({leader: 'Gandalf'});
        h.feed('Gandalf dotyka swietlistego slupa energii.');
        expect(h.set).toHaveBeenCalledWith('dotknij slupa;e;e;wespnij sie po linie');
        expect(h.events).toContainEqual({
            type: 'followSpecialExit',
            detail: {exit: 'dotknij slupa;e;e;wespnij sie po linie'},
        });
    });

    test('ignores lines that do not mention the leader', () => {
        const h = makeHarness({leader: 'Gandalf'});
        h.feed('Saruman dotyka swietlistego slupa energii.');
        expect(h.set).not.toHaveBeenCalled();
    });

    test('does nothing when there is no leader', () => {
        const h = makeHarness({});
        h.feed('Gandalf dotyka swietlistego slupa energii.');
        expect(h.set).not.toHaveBeenCalled();
    });

    test('builds dynamic commands from the captured group', () => {
        const h = makeHarness({leader: 'Gandalf'});
        h.feed('Gandalf podaza na druga strone mostu, stapajac po zielonych plytkach.');
        expect(h.set).toHaveBeenCalledWith('przejdz po zielonych plytkach');
    });

    test('handles hyphenated directions on the plank (regression for (.*) capture)', () => {
        const h = makeHarness({leader: 'Gandalf'});
        h.feed('Gandalf przechodzi na polnocny-wschod po desce nad metna woda.');
        expect(h.set).toHaveBeenCalledWith('polnocny-wschod');
    });

    test('uses the character-specific draw-weapon verb instead of hardcoded "dobadz"', () => {
        const h = makeHarness({leader: 'Gandalf', drawWeaponCommand: 'wyjmij'});
        h.feed('Gandalf znika w glebinach komina, pomagajac sobie przy tym wolna reka.');
        expect(h.set).toHaveBeenCalledWith('opusc bronie;wejdz do komina;wyjmij wszystkich broni');
    });

    test('forces "wejdz na gore" in room 17944 (Lua override)', () => {
        const h = makeHarness({leader: 'Gandalf', roomId: 17944});
        h.feed('Gandalf zaczyna schodzic na dol.');
        expect(h.set).toHaveBeenLastCalledWith('wejdz na gore');
    });

    test('pins the conflicting "szczelina" line to "przecisnij sie przez szczeline"', () => {
        const h = makeHarness({leader: 'Gandalf'});
        h.feed('Gandalf przeslizguje sie przez szczeline.');
        expect(h.set).toHaveBeenCalledWith('przecisnij sie przez szczeline');
        expect(h.set).not.toHaveBeenCalledWith('przeslizgnij sie przez szczeline');
    });

    // Lines captured from a live session that previously failed to bind; now sourced from Arkadia.xml.
    test.each([
        ['Grung calkiem sprawnie radzac sobie ze wspinaczka po korzeniach zaczyna wspinac sie na powierzchnie.', 'wespnij sie na gore'],
        ['Grung zaczyna wspinac sie na most.', 'wespnij sie na most'],
        ['Grung zaczyna przeciskac sie przez odplyw.', 'przecisnij sie przez odplyw'],
        ['Grung schodzi po zboczu.', 'zejdz po zboczu'],
    ])('binds %j -> %j', (line, command) => {
        const h = makeHarness({leader: 'Grung'});
        h.feed(line);
        expect(h.set).toHaveBeenCalledWith(command);
    });
});
