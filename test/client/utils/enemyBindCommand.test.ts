import { enemyBindSteps, enemyBindCommandLabel } from '@client/utils/enemyBindCommand';

const send = (command: string) => ({ kind: 'send', command });

describe('enemyBindSteps', () => {
    it('fills {wrog} in as the object the game addresses', () => {
        expect(enemyBindSteps('wesprzyj {wrog}', 12345)).toEqual([send('wesprzyj ob_12345')]);
        expect(enemyBindSteps('zabij { WROG }', 7)).toEqual([send('zabij ob_7')]);
    });

    it('still fills the bare number in for the older placeholders', () => {
        expect(enemyBindSteps('zabij ob_{obj_id}', 12345)).toEqual([send('zabij ob_12345')]);
        expect(enemyBindSteps('wesprzyj ob_$id', 12345)).toEqual([send('wesprzyj ob_12345')]);
        expect(enemyBindSteps('zabij ob_{objId}', 7)).toEqual([send('zabij ob_7')]);
    });

    it('splits the command into steps on ;', () => {
        expect(enemyBindSteps('wskaz {wrog} jako cel; zabij {wrog}', 42))
            .toEqual([send('wskaz ob_42 jako cel'), send('zabij ob_42')]);
        expect(enemyBindSteps(' ; zabij {wrog} ;', 42)).toEqual([send('zabij ob_42')]);
    });

    it('turns {atak} and {blok} into the built-in behaviour', () => {
        expect(enemyBindSteps('dobadz broni; {atak}', 42))
            .toEqual([send('dobadz broni'), { kind: 'attack' }]);
        expect(enemyBindSteps('{ ATAK };{blok}', 42))
            .toEqual([{ kind: 'attack' }, { kind: 'block' }]);
    });

    it('sends a template without a placeholder as written', () => {
        expect(enemyBindSteps('zabij cel', 42)).toEqual([send('zabij cel')]);
    });

    it('leaves words that only look like a placeholder alone', () => {
        expect(enemyBindSteps('zabij $identyfikator', 42)).toEqual([send('zabij $identyfikator')]);
        expect(enemyBindSteps('krzyknij {atak} teraz', 42)).toEqual([send('krzyknij {atak} teraz')]);
    });

    it('is null when nothing is configured, so the built-in behaviour stands', () => {
        expect(enemyBindSteps('', 42)).toBeNull();
        expect(enemyBindSteps('   ', 42)).toBeNull();
        expect(enemyBindSteps(' ; ', 42)).toBeNull();
        expect(enemyBindSteps(undefined, 42)).toBeNull();
    });
});

describe('enemyBindCommandLabel', () => {
    it('names a custom command by the first word of its first step, falling back when unset', () => {
        expect(enemyBindCommandLabel('rozbroj {wrog}', 'zablokuj')).toBe('rozbroj');
        expect(enemyBindCommandLabel('rozbroj {wrog}; {atak}', 'zablokuj')).toBe('rozbroj');
        expect(enemyBindCommandLabel('{blok}; krzyknij hej', 'zablokuj')).toBe('zablokuj');
        expect(enemyBindCommandLabel('', 'zablokuj')).toBe('zablokuj');
    });
});
