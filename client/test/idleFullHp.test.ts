import initIdleFullHp from '../src/scripts/idleFullHp';
import appEventBus from '../src/events/app-event-bus';

describe('idle full hp notification', () => {
  class FakeClient {
    notify = jest.fn();
  }

  beforeEach(() => {
    appEventBus.clear();
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
    appEventBus.clear();
  });

  test('notifies when reaching full hp after idle', () => {
    const client = new FakeClient();
    initIdleFullHp((client as unknown) as any);
    appEventBus.emit('gmcp.char.state', { hp: 5 });
    jest.setSystemTime(120000);
    appEventBus.emit('gmcp.char.state', { hp: 6 });
    expect(client.notify).toHaveBeenCalledWith('Masz pelne zycie');
  });

  test('does not notify before idle threshold', () => {
    const client = new FakeClient();
    initIdleFullHp((client as unknown) as any);
    appEventBus.emit('gmcp.char.state', { hp: 5 });
    jest.setSystemTime(119000);
    appEventBus.emit('gmcp.char.state', { hp: 6 });
    expect(client.notify).not.toHaveBeenCalled();
  });

  test('command resets idle timer', () => {
    const client = new FakeClient();
    initIdleFullHp((client as unknown) as any);
    appEventBus.emit('gmcp.char.state', { hp: 5 });
    jest.setSystemTime(90000);
    appEventBus.emit('command', 'look');
    jest.setSystemTime(180000);
    appEventBus.emit('gmcp.char.state', { hp: 5 });
    jest.setSystemTime(210000);
    appEventBus.emit('gmcp.char.state', { hp: 6 });
    expect(client.notify).toHaveBeenCalledWith('Masz pelne zycie');
  });
});
