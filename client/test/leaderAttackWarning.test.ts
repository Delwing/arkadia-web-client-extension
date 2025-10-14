import initLeaderAttackWarning from '../src/scripts/leaderAttackWarning';
import { stripAnsiCodes } from '../src/Triggers';
import appEventBus from '../src/events/app-event-bus';

class FakeClient {
  TeamManager = {
    getAttackTargetId: jest.fn(),
    getAvatarAttackTargetId: jest.fn(),
  } as any;
  supportBind = { key: 'KeyQ', ctrl: true };
  attackBind = { key: 'Digit1', ctrl: true };
  println = jest.fn();
}

describe('leader attack warning', () => {
  let client: FakeClient;

  beforeEach(() => {
    appEventBus.clear();
    client = new FakeClient();
    jest.useFakeTimers();
    initLeaderAttackWarning((client as unknown) as any);
  });

  afterEach(() => {
    jest.useRealTimers();
    appEventBus.clear();
  });

  test('suggests attacking when leader hits attack target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('1');
    client.TeamManager.getAvatarAttackTargetId.mockReturnValue(undefined);
    appEventBus.emit('teamLeaderTargetNoAvatar', '1');
    const text = stripAnsiCodes(client.println.mock.calls[0][0]);
    expect(text).toContain('Zaatakuj cel ataku');
    expect(text).toContain('CTRL+1');
  });

  test('suggests support when leader hits different target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('2');
    client.TeamManager.getAvatarAttackTargetId.mockReturnValue(undefined);
    appEventBus.emit('teamLeaderTargetNoAvatar', '1');
    const text = stripAnsiCodes(client.println.mock.calls[0][0]);
    expect(text).toContain('wesprzyj');
    expect(text).toContain('CTRL+Q');
  });

  test('prints nothing when avatar attacks attack target', () => {
    client.TeamManager.getAttackTargetId.mockReturnValue('3');
    client.TeamManager.getAvatarAttackTargetId.mockReturnValue('3');
    appEventBus.emit('teamLeaderTargetNoAvatar', '1');
    expect(client.println).not.toHaveBeenCalled();
  });
});
