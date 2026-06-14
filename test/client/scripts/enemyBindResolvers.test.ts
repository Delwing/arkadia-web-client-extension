import { enemyBindResolvers } from '@client/scripts/enemyBindResolvers';

describe('enemyBindResolvers registry', () => {
  beforeEach(() => {
    enemyBindResolvers.clear();
  });

  const candidate = (num: number, desc = `mob ${num}`) => ({ num, desc });

  test('returns candidates unchanged when no resolvers registered', () => {
    const input = [candidate(1), candidate(2)];
    const result = enemyBindResolvers.apply(input, []);
    expect(result).toEqual(input);
  });

  test('resolver can reorder the candidate list', () => {
    enemyBindResolvers.register('reverse', candidates => [...candidates].reverse());
    const result = enemyBindResolvers.apply([candidate(1), candidate(2), candidate(3)], []);
    expect(result.map(c => c.num)).toEqual([3, 2, 1]);
  });

  test('resolver can inject enemies the built-in scan missed', () => {
    enemyBindResolvers.register('inject', (candidates, allObjects) => {
      const extra = allObjects
        .filter(o => o.desc?.includes('totem'))
        .map(o => ({ num: o.num, desc: o.desc! }));
      return [...candidates, ...extra];
    });
    const result = enemyBindResolvers.apply(
      [candidate(1)],
      [{ num: 1, desc: 'mob 1' }, { num: 9, desc: 'a totem' }]
    );
    expect(result.map(c => c.num)).toEqual([1, 9]);
  });

  test('returning void leaves the list unchanged', () => {
    enemyBindResolvers.register('inspect', () => { /* no return */ });
    const result = enemyBindResolvers.apply([candidate(1), candidate(2)], []);
    expect(result.map(c => c.num)).toEqual([1, 2]);
  });

  test('resolvers compose in priority order (higher first)', () => {
    const calls: string[] = [];
    enemyBindResolvers.register('low', c => { calls.push('low'); return c; }, 1);
    enemyBindResolvers.register('high', c => { calls.push('high'); return c; }, 10);
    enemyBindResolvers.apply([candidate(1)], []);
    expect(calls).toEqual(['high', 'low']);
  });

  test('output of one resolver feeds the next', () => {
    enemyBindResolvers.register('add-2', c => [...c, candidate(2)], 10);
    enemyBindResolvers.register('add-3', c => [...c, candidate(3)], 5);
    const result = enemyBindResolvers.apply([candidate(1)], []);
    expect(result.map(c => c.num)).toEqual([1, 2, 3]);
  });

  test('duplicate nums are dropped, first occurrence wins', () => {
    enemyBindResolvers.register('dupe', c => [...c, candidate(1, 'duplicate')]);
    const result = enemyBindResolvers.apply([candidate(1, 'original')], []);
    expect(result).toEqual([{ num: 1, desc: 'original' }]);
  });

  test('a throwing resolver is skipped and the previous list is kept', () => {
    enemyBindResolvers.register('boom', () => { throw new Error('boom'); }, 10);
    enemyBindResolvers.register('append', c => [...c, candidate(2)], 5);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const result = enemyBindResolvers.apply([candidate(1)], []);
    expect(result.map(c => c.num)).toEqual([1, 2]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  test('re-registering the same name replaces the resolver', () => {
    enemyBindResolvers.register('x', c => [...c, candidate(2)]);
    enemyBindResolvers.register('x', c => [...c, candidate(3)]);
    const result = enemyBindResolvers.apply([candidate(1)], []);
    expect(result.map(c => c.num)).toEqual([1, 3]);
  });

  test('unregister removes a resolver and reports success', () => {
    enemyBindResolvers.register('x', c => [...c, candidate(2)]);
    expect(enemyBindResolvers.unregister('x')).toBe(true);
    expect(enemyBindResolvers.unregister('x')).toBe(false);
    const result = enemyBindResolvers.apply([candidate(1)], []);
    expect(result.map(c => c.num)).toEqual([1]);
  });

  test('getResolverNames lists names in priority order', () => {
    enemyBindResolvers.register('low', c => c, 1);
    enemyBindResolvers.register('high', c => c, 10);
    expect(enemyBindResolvers.getResolverNames()).toEqual(['high', 'low']);
  });
});
