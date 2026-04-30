import { AliasList } from '@client/AliasList';

const cb = () => {};

describe('AliasList', () => {
    test('slash alias goes into slash bucket', () => {
        const list = new AliasList();
        list.push({ pattern: /^\/foo$/, callback: cb });
        expect(list.forCommand('/foo')).toHaveLength(1);
        expect(list.forCommand('foo')).toHaveLength(0);
    });

    test('non-slash alias goes into other bucket', () => {
        const list = new AliasList();
        list.push({ pattern: /^cechy$/, callback: cb });
        expect(list.forCommand('cechy')).toHaveLength(1);
        expect(list.forCommand('/cechy')).toHaveLength(0);
    });

    test('optional-slash alias (^\\/?...) goes into other bucket', () => {
        const list = new AliasList();
        list.push({ pattern: /^\/?wem$/, callback: cb });
        expect(list.forCommand('wem')).toHaveLength(1);
        expect(list.forCommand('/wem')).toHaveLength(0);
    });

    test('slash alias without leading anchor goes into slash bucket', () => {
        const list = new AliasList();
        list.push({ pattern: /\/binds$/, callback: cb });
        expect(list.forCommand('/binds')).toHaveLength(1);
        expect(list.forCommand('binds')).toHaveLength(0);
    });

    test('splice removes entry from main array and bucket', () => {
        const list = new AliasList();
        list.push({ pattern: /^\/foo$/, callback: cb });
        list.splice(0, 1);
        expect(list).toHaveLength(0);
        expect(list.forCommand('/foo')).toHaveLength(0);
    });

    test('splice removes correct entry when multiple present', () => {
        const list = new AliasList();
        const a = { pattern: /^\/a$/, callback: cb };
        const b = { pattern: /^\/b$/, callback: cb };
        list.push(a, b);
        list.splice(0, 1);
        expect(list).toHaveLength(1);
        // forCommand returns the whole slash bucket — after removing a, only b remains
        const slashAliases = list.forCommand('/cmd');
        expect(slashAliases).toHaveLength(1);
        expect(slashAliases[0]).toBe(b);
    });

    test('indexOf and splice together (PluginApi removal pattern)', () => {
        const list = new AliasList();
        const entry = { pattern: /^\/bar$/, callback: cb };
        list.push(entry);
        const idx = list.findIndex(a => a.pattern === entry.pattern && a.callback === entry.callback);
        expect(idx).toBe(0);
        list.splice(idx, 1);
        expect(list).toHaveLength(0);
        expect(list.forCommand('/bar')).toHaveLength(0);
    });

    test('behaves as an array (length, for..of, findIndex)', () => {
        const list = new AliasList();
        list.push({ pattern: /^\/a$/, callback: cb });
        list.push({ pattern: /^b$/, callback: cb });
        expect(list).toHaveLength(2);
        const collected = [...list];
        expect(collected).toHaveLength(2);
        expect(list.findIndex(a => a.pattern.source === '^b$')).toBe(1);
    });

    test('multiple slash and non-slash aliases are bucketed independently', () => {
        const list = new AliasList();
        list.push({ pattern: /^\/x$/, callback: cb });
        list.push({ pattern: /^y$/, callback: cb });
        list.push({ pattern: /^\/z$/, callback: cb });
        expect(list.forCommand('/cmd')).toHaveLength(2);
        expect(list.forCommand('cmd')).toHaveLength(1);
    });
});
