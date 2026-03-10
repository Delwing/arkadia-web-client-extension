import initBinds from '@client/scripts/binds';

class FakeClient {
  FunctionalBind = { getLabel: jest.fn(() => ']'), getCategoryLabel: jest.fn((_cat?: string) => ']') };
  lampBind = { key: 'Digit4', ctrl: true };
  attackBind = { key: 'Digit1', ctrl: true };
  supportBind = { key: 'KeyQ', ctrl: true };
  moveModeBind = { key: 'Backquote' };
  println = jest.fn();
}

describe('binds alias', () => {
  test('prints current binds', () => {
    const client = new FakeClient();
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initBinds((client as unknown) as any, aliases);
    const show = aliases[0].callback;
    show();
    expect(client.println).toHaveBeenCalledTimes(1);
    const printed = client.println.mock.calls[0][0];
    expect(printed).toContain('Domy\u015Blny: ]');
    expect(printed).toContain('Atakuj: CTRL+1');
    expect(printed).toContain('Nape\u0142nij lamp\u0119: CTRL+4');
    expect(printed).toContain('Wesprzyj: CTRL+Q');
    expect(printed).toContain('Tryb ruchu: `');
  });

  test('prints category binds when they differ from default', () => {
    const client = new FakeClient();
    client.FunctionalBind.getLabel.mockReturnValue(']');
    client.FunctionalBind.getCategoryLabel.mockImplementation((cat: string): string => {
      if (cat === 'gates') return '[';
      if (cat === 'transport') return 'F6';
      return ']';
    });
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initBinds((client as unknown) as any, aliases);
    const show = aliases[0].callback;
    show();
    expect(client.println).toHaveBeenCalledTimes(1);
    const printed = client.println.mock.calls[0][0];
    expect(printed).toContain('Wrota: [');
    expect(printed).toContain('Transport: F6');
  });

  test('does not print category binds when same as default', () => {
    const client = new FakeClient();
    const aliases: { pattern: RegExp; callback: () => void }[] = [];
    initBinds((client as unknown) as any, aliases);
    const show = aliases[0].callback;
    show();
    const printed = client.println.mock.calls[0][0];
    expect(printed).not.toContain('Wrota:');
    expect(printed).not.toContain('Transport:');
  });
});
