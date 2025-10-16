import initLeaderAttackWarning from '../src/scripts/leaderAttackWarning';
import { stripAnsiCodes } from '../src/Triggers';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  TeamManager = {
    getAttackTargetId: jest.fn(),
    getAvatarAttackTargetId: jest.fn(),
  } as any;
  supportBind = { key: 'KeyQ', ctrl: true };
  attackBind = { key: 'Digit1', ctrl: true };
  println = jest.fn();
  addEventListener(event: string, cb: any) {
    this.emitter.on(event, cb);
  }
  removeEventListener(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  sendEvent(type: string, detail?: any) {
    this.emitter.emit(type, { detail });
  }
}

describe('leader attack warning', () => {
  let client: FakeClient;

  beforeEach(() => {
    client = new FakeClient();
    jest.useFakeTimers();
    jest.setSystemTime(0);
    initLeaderAttackWarning((client as unknown) as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('suggests attacking when leader hits attack target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('1');
    client.TeamManager.getAvatarAttackTargetId.mockReturnValue(undefined);
    client.sendEvent('teamLeaderTargetNoAvatar', '1');
    const text = stripAnsiCodes(client.println.mock.calls[0][0]);
    expect(text).toContain('Zaatakuj cel ataku');
    expect(text).toContain('CTRL+1');
  });

  test('suggests support when leader hits different target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('2');
    client.TeamManager.getAvatarAttackTargetId.mockReturnValue(undefined);
    client.sendEvent('teamLeaderTargetNoAvatar', '1');
    const text = stripAnsiCodes(client.println.mock.calls[0][0]);
    expect(text).toContain('wesprzyj');
    expect(text).toContain('CTRL+Q');
  });

  test('prints nothing when avatar attacks attack target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('3');
    client.TeamManager.getAvatarAttackTargetId.mockReturnValue('3');
    client.sendEvent('teamLeaderTargetNoAvatar', '1');
    expect(client.println).not.toHaveBeenCalled();
  });

  test('reprints warning on gmcp updates after interval passes', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('1');
    client.TeamManager.getAvatarAttackTargetId.mockReturnValue(undefined);
    client.sendEvent('teamLeaderTargetNoAvatar', '1');
    client.println.mockClear();

    jest.advanceTimersByTime(4000);
    client.sendEvent('gmcp.objects.data', {});
    expect(client.println).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    client.sendEvent('gmcp.objects.data', {});
    expect(client.println).toHaveBeenCalledTimes(1);
  });

  test('drops warning after drop flag is set and interval passes', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('1');
    client.TeamManager.getAvatarAttackTargetId.mockReturnValue(undefined);
    client.sendEvent('teamLeaderTargetNoAvatar', '1');
    client.println.mockClear();

    client.sendEvent('gmcp.objects.data', { '99': { drop_leader_attack_warning: true } });
    expect(client.println).not.toHaveBeenCalled();

    jest.advanceTimersByTime(4000);
    client.sendEvent('gmcp.objects.data', {});
    expect(client.println).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1000);
    client.sendEvent('gmcp.objects.data', {});
    expect(client.println).not.toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    client.sendEvent('teamLeaderTargetNoAvatar', '1');
    expect(client.println).toHaveBeenCalledTimes(1);
  });
});
