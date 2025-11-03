import { EventBus } from '@modules/core/eventBus';

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

  test('supports once flag via boolean', () => {
    const handler = jest.fn();
    bus.on('single', handler, true);
    bus.emit('single', 1);
    bus.emit('single', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  test('respects AbortSignal option', () => {
    const handler = jest.fn();
    const controller = new AbortController();

    bus.on('single', handler, { signal: controller.signal });
    controller.abort();

    bus.emit('single', 1);

    expect(handler).not.toHaveBeenCalled();
  });
});
