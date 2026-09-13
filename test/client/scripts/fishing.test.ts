import initFishing from '@client/scripts/fishing';
import Triggers from '@client/Triggers';
import eventBus from '@modules/core/eventBus';

class FakeClient {
  Triggers = new Triggers(({} as unknown) as any);
  FunctionalBind = { set: jest.fn(), clear: jest.fn() };
  sendCommand = jest.fn().mockResolvedValue(undefined);
  sendEvent = jest.fn();
  now = () => 0;
}

// The cast handler awaits each command, so let the microtasks settle.
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('fishing cast', () => {
  let client: FakeClient;

  beforeEach(() => {
    eventBus.clear();
    client = new FakeClient();
    initFishing((client as unknown) as any, []);
  });

  afterEach(() => {
    eventBus.clear();
  });

  const sentCommands = () => client.sendCommand.mock.calls.map(([command]) => command);

  test('takes a worm out of the box before baiting the hook', async () => {
    eventBus.emit('fishing.cast', { bait: 'robaka' });
    await flush();

    expect(sentCommands()).toEqual([
      'wez robaka z pudelka',
      'zawies robaka na wedce',
      'zarzuc wedke',
    ]);
  });

  test('does not touch the box for other baits', async () => {
    eventBus.emit('fishing.cast', { bait: 'rybke' });
    await flush();

    expect(sentCommands()).toEqual([
      'zawies rybke na wedce',
      'zarzuc wedke',
    ]);
  });

  test('falls back to the bread ball when no bait is given', async () => {
    eventBus.emit('fishing.cast', ({} as unknown) as { bait: never });
    await flush();

    expect(sentCommands()).toEqual([
      'zawies kulke na wedce',
      'zarzuc wedke',
    ]);
  });
});
