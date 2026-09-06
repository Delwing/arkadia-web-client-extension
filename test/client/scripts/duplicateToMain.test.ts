import initCombatWindow, {
    getCombatHistory,
    setCombatRedirectSetting,
} from '@client/scripts/combatWindow';
import registerLuaGagTriggers from '@client/scripts/luaGags';
import {
    registerDuplicateToMain,
    resetDuplicateToMainRules,
    unregisterDuplicateToMain,
} from '@client/scripts/duplicateToMain';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  on = jest.fn();
  sendEvent = jest.fn();
  print = jest.fn();
  drawWeaponCommand = 'dobadz';
  TeamManager = { getTeamMembers: () => [] as string[] };
  FunctionalBind = {
    newMessage: jest.fn(),
    set: jest.fn(),
    setCategory: jest.fn(),
    getLabel: () => 'F1',
  };
}

describe('duplicate to main window', () => {
  let client: FakeClient;
  let parse: (line: string, type: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    registerLuaGagTriggers((client as unknown) as any);
    initCombatWindow((client as unknown) as any);
    parse = (line: string, type: string) =>
      Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), type);
    getCombatHistory().length = 0;
    setCombatRedirectSetting('combat.avatar', true);
  });

  afterEach(() => {
    setCombatRedirectSetting('combat.avatar', false);
    getCombatHistory().length = 0;
    resetDuplicateToMainRules();
  });

  test('an ordinary combat line is redirected only', () => {
    const result = parse('Tniesz Orka mieczem.', 'combat.avatar');

    expect(result).toBeNull();
    expect(getCombatHistory()).toHaveLength(1);
    expect(client.print).not.toHaveBeenCalled();
  });

  test('weapon knocked off is redirected and copied to the main window', () => {
    const result = parse('Ork zwinnym ruchem wytraca ci miecz.', 'combat.avatar');

    expect(client.sendEvent).toHaveBeenCalledWith('weaponKnockedOff');
    // Still redirected: gone from the main output, present in the popup.
    expect(result).toBeNull();
    expect(getCombatHistory()).toHaveLength(1);
    // ...and echoed back as a separate main-window message.
    expect(client.print).toHaveBeenCalledTimes(1);
    expect(client.print.mock.calls[0][0].text).toContain('[    BRON    ]');
  });

  test('can wield again is copied to the main window', () => {
    parse(
      'Czujesz, ze efekt dzialania czaru \'rozbrojenie postaci\' konczy sie i powoli odzyskujesz czucie w swoich dloniach.',
      'combat.avatar',
    );

    expect(client.sendEvent).toHaveBeenCalledWith('canWieldAfterKnockOff');
    expect(client.print).toHaveBeenCalledTimes(1);
    expect(client.print.mock.calls[0][0].text).toContain('[    BRON    ]');
  });

  test('the copy is independent of the deleted original', () => {
    parse('Ork zwinnym ruchem wytraca ci miecz.', 'combat.avatar');

    expect(client.print.mock.calls[0][0].deleted).toBe(false);
  });

  test('custom rules can render their own line', () => {
    registerDuplicateToMain({
      tag: 'test-rule',
      match: /Tniesz/,
      render: () => 'trafiony',
    });

    const result = parse('Tniesz Orka mieczem.', 'combat.avatar');

    expect(result).toBeNull();
    expect(client.print).toHaveBeenCalledWith('trafiony');
  });

  test('rules can be removed', () => {
    unregisterDuplicateToMain('weapon-knock-off');

    parse('Ork zwinnym ruchem wytraca ci miecz.', 'combat.avatar');

    expect(client.print).not.toHaveBeenCalled();
  });

  test('nothing is duplicated when the redirect is off', () => {
    setCombatRedirectSetting('combat.avatar', false);

    const result = parse('Ork zwinnym ruchem wytraca ci miecz.', 'combat.avatar');

    expect(result?.text).toContain('[    BRON    ]');
    expect(client.print).not.toHaveBeenCalled();
  });
});
