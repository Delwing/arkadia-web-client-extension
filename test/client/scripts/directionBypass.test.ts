import initDirectionBypass from '@client/scripts/directionBypass';

describe('direction bypass aliases', () => {
  function setup() {
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    const client: any = { send: jest.fn() };
    initDirectionBypass(client, aliases);
    return { client, aliases };
  }

  function run(command: string, client: any, aliases: { pattern: RegExp; callback: Function }[]) {
    const alias = aliases.find(a => a.pattern.test(command));
    expect(alias).toBeDefined();
    const match = command.match(alias!.pattern)!;
    alias!.callback(match);
  }

  test.each(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'u', 'd'])(
    'sends plain "%s" for "%s!"',
    (dir) => {
      const { client, aliases } = setup();
      run(`${dir}!`, client, aliases);
      expect(client.send).toHaveBeenCalledWith(dir);
    }
  );

  test('does not match a plain direction without "!"', () => {
    const { aliases } = setup();
    expect(aliases.some(a => a.pattern.test('n'))).toBe(false);
  });

  test('does not match unrelated commands ending in "!"', () => {
    const { aliases } = setup();
    expect(aliases.some(a => a.pattern.test('zabij!'))).toBe(false);
  });
});
