import initWeaponState from '@client/scripts/weaponState';
import registerLuaGagTriggers from '@client/scripts/luaGags';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import Triggers from '@client/Triggers';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  listeners: Record<string, ((...args: any[]) => void)[]> = {};
  on = (event: string, cb: (...args: any[]) => void) => {
    (this.listeners[event] ??= []).push(cb);
    return () => {};
  };
  sendEvent = jest.fn((event: string, ...args: any[]) => {
    (this.listeners[event] ?? []).forEach(cb => cb(...args));
  });
}

describe('weapon state', () => {
  let client: FakeClient;
  const gag = (text: string, type = 'moje_ciosy') =>
    client.sendEvent('combat.gag', { type, prefix: '3/6', text });
  const weaponEvents = () => client.sendEvent.mock.calls.filter(c => c[0] === 'weapon_state');

  beforeEach(() => {
    client = new FakeClient();
    initWeaponState((client as unknown) as any);
    client.sendEvent.mockClear();
  });

  test('first own weapon hit arms an unknown state', () => {
    gag('Ranisz orka w lewe ramie.');
    expect(weaponEvents()).toEqual([['weapon_state', true]]);
  });

  test('only checks once', () => {
    gag('Ranisz orka w lewe ramie.');
    gag('Ranisz orka w lewe ramie.');
    expect(weaponEvents()).toHaveLength(1);
  });

  test('ignores gags that are not own regular hits', () => {
    gag('Ork rani cie w lewe ramie.', 'innych_ciosy_we_mnie');
    gag('Wykonujesz potezny cios.', 'moje_spece');
    expect(weaponEvents()).toHaveLength(0);
  });

  test('unarmed hit does not arm and settles the check', () => {
    gag('Ranisz orka lewa piescia.');
    gag('Ranisz orka w lewe ramie.');
    expect(weaponEvents()).toHaveLength(0);
  });

  test('known unarmed state is not overridden by a hit', () => {
    client.sendEvent('weapon_state', false);
    client.sendEvent.mockClear();
    gag('Masakrujesz orka.');
    expect(weaponEvents()).toHaveLength(0);
  });

  test('fighting without a weapon disarms', () => {
    client.sendEvent('weapon_state', true);
    client.sendEvent.mockClear();
    client.sendEvent('ateamFightingWithNoWeapon');
    expect(weaponEvents()).toEqual([['weapon_state', false]]);
  });

  test('lowering a weapon disarms, leaving an area does not', () => {
    const line = (text: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(text), 'main');
    line('Opuszczasz obszar ogarniety burza piaskowa.');
    expect(weaponEvents()).toHaveLength(0);
    line('Opuszczasz waski kunsztowny sihill.');
    expect(weaponEvents()).toEqual([['weapon_state', false]]);
  });

  test('disconnect makes the state unknown again', () => {
    client.sendEvent('weapon_state', false);
    client.sendEvent('client.disconnect');
    client.sendEvent.mockClear();
    gag('Lekko ranisz orka w brzuch.');
    expect(weaponEvents()).toEqual([['weapon_state', true]]);
  });
});

describe('weapon state through real gags', () => {
  class GagClient extends FakeClient {
    print = jest.fn();
    drawWeaponCommand = 'dobadz';
    TeamManager = { getTeamMembers: () => [] as string[] };
    FunctionalBind = { newMessage: jest.fn(), set: jest.fn(), setCategory: jest.fn(), getLabel: () => 'F1' };
  }

  test('a Lua weapon-specific own hit arms an unknown state', () => {
    const client = new GagClient();
    registerLuaGagTriggers((client as unknown) as any);
    initWeaponState((client as unknown) as any);
    Triggers.prototype.parseLine.call(
      client.Triggers,
      new AnsiAwareBuffer('Swobodnym ruchem swojego srebrnego kunsztownego miecza zacinasz lekko skore orka trafiajac go w reke.'),
      'combat.avatar',
    );
    expect(client.sendEvent).toHaveBeenCalledWith('weapon_state', true);
  });
});
