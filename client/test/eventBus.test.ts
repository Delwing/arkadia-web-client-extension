import eventBusSingleton, { EventBus, GLOBAL_EVENT_BUS_KEY } from '../src/eventBus';

type TestEvents = {
  single: number;
  multi: [string, number];
  void: void;
};

describe('EventBus', () => {
  let bus: EventBus<TestEvents>;

  beforeEach(() => {
    bus = new EventBus<TestEvents>();
  });

  test('handles single argument events', () => {
    const handler = jest.fn();
    bus.on('single', handler);
    bus.emit('single', 5);
    expect(handler).toHaveBeenCalledWith(5);
  });

  test('handles multiple arguments and void events', () => {
    const multiHandler = jest.fn();
    const voidHandler = jest.fn();
    bus.on('multi', multiHandler);
    bus.on('void', voidHandler);
    bus.emit('multi', 'test', 7);
    bus.emit('void');
    expect(multiHandler).toHaveBeenCalledWith('test', 7);
    expect(voidHandler).toHaveBeenCalledTimes(1);
  });

  test('off removes listener', () => {
    const handler = jest.fn();
    bus.on('single', handler);
    bus.off('single', handler);
    bus.emit('single', 1);
    expect(handler).not.toHaveBeenCalled();
  });

  test('exports shared singleton via global key', () => {
    const globalBus = (globalThis as typeof globalThis & {
      [GLOBAL_EVENT_BUS_KEY]?: EventBus<TestEvents>;
    })[GLOBAL_EVENT_BUS_KEY];

    expect(eventBusSingleton).toBeDefined();
    expect(globalBus).toBe(eventBusSingleton);
  });
});
