import { enemyBindCommand, enemyBindCommandLabel } from '@client/utils/enemyBindCommand';

describe('enemyBindCommand', () => {
    it('fills the enemy object number in, in every spelling of the placeholder', () => {
        expect(enemyBindCommand('zabij ob_{obj_id}', 12345)).toBe('zabij ob_12345');
        expect(enemyBindCommand('wesprzyj ob_$id', 12345)).toBe('wesprzyj ob_12345');
        expect(enemyBindCommand('zabij ob_{objId}', 7)).toBe('zabij ob_7');
        expect(enemyBindCommand('zabij ob_{ id }', 7)).toBe('zabij ob_7');
        expect(enemyBindCommand('zabij ob_{OBJ_ID}', 7)).toBe('zabij ob_7');
        expect(enemyBindCommand('zabij ob_$obj_id', 7)).toBe('zabij ob_7');
    });

    it('fills every occurrence', () => {
        expect(enemyBindCommand('wskaz ob_{obj_id} jako cel; zabij ob_{obj_id}', 42))
            .toBe('wskaz ob_42 jako cel; zabij ob_42');
    });

    it('sends a template without a placeholder as written', () => {
        expect(enemyBindCommand('zabij cel', 42)).toBe('zabij cel');
    });

    it('leaves words that only look like the placeholder alone', () => {
        expect(enemyBindCommand('zabij $identyfikator', 42)).toBe('zabij $identyfikator');
    });

    it('is null when nothing is configured, so the built-in behaviour stands', () => {
        expect(enemyBindCommand('', 42)).toBeNull();
        expect(enemyBindCommand('   ', 42)).toBeNull();
        expect(enemyBindCommand(undefined, 42)).toBeNull();
    });
});

describe('enemyBindCommandLabel', () => {
    it('names a custom command by its first word, falling back when unset', () => {
        expect(enemyBindCommandLabel('rozbroj ob_{obj_id}', 'zablokuj')).toBe('rozbroj');
        expect(enemyBindCommandLabel('', 'zablokuj')).toBe('zablokuj');
    });
});
