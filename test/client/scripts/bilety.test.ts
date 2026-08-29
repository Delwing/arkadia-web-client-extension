import initBilety, { teamTicketCommands } from '@client/scripts/bilety';

const makeClient = (teammates: { num: number; desc?: string }[]) => ({
  TeamManager: { getTeamObjectsOnLocation: () => teammates },
  println: jest.fn(),
  sendCommand: jest.fn(),
});

describe('bilety', () => {
  test('teamTicketCommands pairs a purchase with a hand-over per teammate', () => {
    const client = makeClient([{ num: 111 }, { num: 222 }]);
    expect(teamTicketCommands(client as any)).toEqual([
      'kup bilet', 'daj bilet ob_111',
      'kup bilet', 'daj bilet ob_222',
    ]);
  });

  test('/bilety wraps the tickets in wem/wlm', async () => {
    const client = makeClient([{ num: 111 }]);
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initBilety(client as any, aliases);
    await aliases.find(a => a.pattern.test('/bilety'))!.callback();
    expect(client.sendCommand).toHaveBeenCalledWith('wem;kup bilet;daj bilet ob_111;wlm');
  });

  test('/bilety with nobody around only says so', async () => {
    const client = makeClient([]);
    const aliases: { pattern: RegExp; callback: Function }[] = [];
    initBilety(client as any, aliases);
    await aliases.find(a => a.pattern.test('/bilety'))!.callback();
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(client.println).toHaveBeenCalledWith('Brak czlonkow druzyny na lokacji.');
  });
});
