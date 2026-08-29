import { gmcp, setGmcp, mergeGmcp, attachGmcpListener } from '@client/gmcp.ts';

describe('gmcp mirror', () => {
  let handler: (payload: { path?: string; value?: unknown }) => void;

  beforeEach(() => {
    Object.keys(gmcp).forEach(key => delete gmcp[key]);
    const target = {
      on: jest.fn((_event: 'gmcp', h: typeof handler) => {
        handler = h;
      }),
    };
    attachGmcpListener(target);
  });

  test('setGmcp sets nested values by path', () => {
    setGmcp('char.options.group_cover', 2);
    expect(gmcp.char.options.group_cover).toBe(2);
  });

  test('mergeGmcp keeps existing keys', () => {
    setGmcp('char.options', { group_cover: 2, form: 1 });
    mergeGmcp('char.options', { form: 0 });
    expect(gmcp.char.options).toEqual({ group_cover: 2, form: 0 });
  });

  test('partial char.options update merges instead of replacing', () => {
    handler({ path: 'char.options', value: { group_cover: 2, state_modifiers: 0 } });
    handler({ path: 'char.options', value: { state_modifiers: 1 } });
    expect(gmcp.char.options).toEqual({ group_cover: 2, state_modifiers: 1 });
  });

  test('other paths are replaced wholesale', () => {
    handler({ path: 'room.info', value: { num: 1, exits: ['n'] } });
    handler({ path: 'room.info', value: { num: 2 } });
    expect(gmcp.room.info).toEqual({ num: 2 });
  });

  test('non-object char.options payload falls back to replace', () => {
    handler({ path: 'char.options', value: { group_cover: 2 } });
    handler({ path: 'char.options', value: null });
    expect(gmcp.char.options).toBeNull();
  });
});
