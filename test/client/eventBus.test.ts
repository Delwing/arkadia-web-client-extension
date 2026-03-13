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

  describe('deduplication', () => {
    test('registering the same handler twice only calls it once on emit', () => {
      const handler = jest.fn();
      bus.on('single', handler);
      bus.on('single', handler);
      bus.emit('single', 42);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    test('registering the same handler on different events registers both', () => {
      const handler = jest.fn();
      bus.on('single', handler);
      bus.on('void', handler);
      bus.emit('single', 1);
      bus.emit('void');
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('unsubscribe function returned from on()', () => {
    test('calling the returned function removes the listener', () => {
      const handler = jest.fn();
      const unsub = bus.on('single', handler);
      unsub();
      bus.emit('single', 1);
      expect(handler).not.toHaveBeenCalled();
    });

    test('calling the returned function multiple times does not throw', () => {
      const handler = jest.fn();
      const unsub = bus.on('single', handler);
      expect(() => {
        unsub();
        unsub();
        unsub();
      }).not.toThrow();
    });

    test('calling unsubscribe on an already-aborted signal returns a no-op that does not throw', () => {
      const controller = new AbortController();
      controller.abort();
      const handler = jest.fn();
      const unsub = bus.on('single', handler, { signal: controller.signal });
      expect(() => unsub()).not.toThrow();
      bus.emit('single', 1);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('already-aborted AbortSignal', () => {
    test('does not register the listener', () => {
      const controller = new AbortController();
      controller.abort();
      const handler = jest.fn();
      bus.on('single', handler, { signal: controller.signal });
      bus.emit('single', 1);
      expect(handler).not.toHaveBeenCalled();
    });

    test('does not count toward listenerCount', () => {
      const controller = new AbortController();
      controller.abort();
      bus.on('single', jest.fn(), { signal: controller.signal });
      expect(bus.listenerCount('single')).toBe(0);
    });
  });

  describe('once via options object', () => {
    test('{ once: true } fires handler only on first emit', () => {
      const handler = jest.fn();
      bus.on('single', handler, { once: true });
      bus.emit('single', 10);
      bus.emit('single', 20);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(10);
    });

    test('{ once: false } keeps handler registered after emit', () => {
      const handler = jest.fn();
      bus.on('single', handler, { once: false });
      bus.emit('single', 1);
      bus.emit('single', 2);
      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('emit return value', () => {
    test('returns the number of listeners invoked', () => {
      const a = jest.fn();
      const b = jest.fn();
      bus.on('single', a);
      bus.on('single', b);
      const count = bus.emit('single', 99);
      expect(count).toBe(2);
    });

    test('returns 0 when there are no listeners', () => {
      const count = bus.emit('single', 1);
      expect(count).toBe(0);
    });

    test('returns 0 for a void event with no listeners', () => {
      const count = bus.emit('void');
      expect(count).toBe(0);
    });

    test('does not count a once listener that was removed before emit', () => {
      const handler = jest.fn();
      bus.on('single', handler, true);
      bus.off('single', handler);
      const count = bus.emit('single', 1);
      expect(count).toBe(0);
    });
  });

  describe('error swallowing', () => {
    test('a throwing handler does not prevent subsequent handlers from being called', () => {
      const throwing = jest.fn(() => { throw new Error('boom'); });
      const safe = jest.fn();
      bus.on('single', throwing);
      bus.on('single', safe);
      expect(() => bus.emit('single', 1)).not.toThrow();
      expect(throwing).toHaveBeenCalledTimes(1);
      expect(safe).toHaveBeenCalledTimes(1);
    });

    test('emit still returns the correct invocation count when handlers throw', () => {
      const throwing = jest.fn(() => { throw new Error('oops'); });
      const safe = jest.fn();
      bus.on('single', throwing);
      bus.on('single', safe);
      const count = bus.emit('single', 1);
      expect(count).toBe(2);
    });
  });

  describe('clear()', () => {
    test('clear(event) removes all listeners for that event only', () => {
      const singleHandler = jest.fn();
      const voidHandler = jest.fn();
      bus.on('single', singleHandler);
      bus.on('void', voidHandler);
      bus.clear('single');
      bus.emit('single', 1);
      bus.emit('void');
      expect(singleHandler).not.toHaveBeenCalled();
      expect(voidHandler).toHaveBeenCalledTimes(1);
    });

    test('clear() with no argument removes all listeners for all events', () => {
      const singleHandler = jest.fn();
      const voidHandler = jest.fn();
      bus.on('single', singleHandler);
      bus.on('void', voidHandler);
      bus.clear();
      bus.emit('single', 1);
      bus.emit('void');
      expect(singleHandler).not.toHaveBeenCalled();
      expect(voidHandler).not.toHaveBeenCalled();
    });

    test('clear(event) sets listenerCount to 0 for that event', () => {
      bus.on('single', jest.fn());
      bus.on('single', jest.fn());
      bus.clear('single');
      expect(bus.listenerCount('single')).toBe(0);
    });

    test('clear() with no argument sets listenerCount to 0 for all events', () => {
      bus.on('single', jest.fn());
      bus.on('void', jest.fn());
      bus.clear();
      expect(bus.listenerCount('single')).toBe(0);
      expect(bus.listenerCount('void')).toBe(0);
    });

    test('clear(event) on a non-existent event does not throw', () => {
      expect(() => bus.clear('single')).not.toThrow();
    });

    test('clear() calls cleanup on listeners that have AbortSignal cleanup registered', () => {
      const controller = new AbortController();
      const removeEventListenerSpy = jest.spyOn(controller.signal, 'removeEventListener');
      bus.on('single', jest.fn(), { signal: controller.signal });
      bus.clear('single');
      expect(removeEventListenerSpy).toHaveBeenCalledWith('abort', expect.any(Function));
    });
  });

  describe('listenerCount()', () => {
    test('returns 0 for an event with no listeners', () => {
      expect(bus.listenerCount('single')).toBe(0);
    });

    test('returns correct count after registering multiple listeners', () => {
      bus.on('single', jest.fn());
      bus.on('single', jest.fn());
      bus.on('single', jest.fn());
      expect(bus.listenerCount('single')).toBe(3);
    });

    test('returns updated count after off()', () => {
      const handler = jest.fn();
      bus.on('single', handler);
      bus.on('single', jest.fn());
      expect(bus.listenerCount('single')).toBe(2);
      bus.off('single', handler);
      expect(bus.listenerCount('single')).toBe(1);
    });

    test('returns 0 after once listener fires and is cleaned up', () => {
      bus.on('single', jest.fn(), true);
      bus.emit('single', 1);
      expect(bus.listenerCount('single')).toBe(0);
    });

    test('does not count the same deduplicated handler more than once', () => {
      const handler = jest.fn();
      bus.on('single', handler);
      bus.on('single', handler);
      expect(bus.listenerCount('single')).toBe(1);
    });
  });

  describe('off() edge cases', () => {
    test('off() on a non-existent event does not throw', () => {
      const handler = jest.fn();
      expect(() => bus.off('single', handler)).not.toThrow();
    });

    test('off() with a non-registered handler does not remove other handlers', () => {
      const registered = jest.fn();
      const unregistered = jest.fn();
      bus.on('single', registered);
      bus.off('single', unregistered);
      bus.emit('single', 1);
      expect(registered).toHaveBeenCalledTimes(1);
    });
  });

  describe('multiple listeners on the same event', () => {
    test('all listeners are called in registration order', () => {
      const callOrder: number[] = [];
      bus.on('single', () => callOrder.push(1));
      bus.on('single', () => callOrder.push(2));
      bus.on('single', () => callOrder.push(3));
      bus.emit('single', 0);
      expect(callOrder).toEqual([1, 2, 3]);
    });
  });

  describe('removing listener during emit', () => {
    test('a handler that calls off() on itself during emit does not break iteration', () => {
      const selfRemoving = jest.fn(() => bus.off('single', selfRemoving));
      const other = jest.fn();
      bus.on('single', selfRemoving);
      bus.on('single', other);
      expect(() => bus.emit('single', 1)).not.toThrow();
      expect(selfRemoving).toHaveBeenCalledTimes(1);
      expect(other).toHaveBeenCalledTimes(1);
    });

    test('self-removing handler is not called on the next emit', () => {
      const selfRemoving = jest.fn(() => bus.off('single', selfRemoving));
      bus.on('single', selfRemoving);
      bus.emit('single', 1);
      bus.emit('single', 2);
      expect(selfRemoving).toHaveBeenCalledTimes(1);
    });
  });

  describe('AbortSignal cleanup after off()', () => {
    test('aborting after off() does not throw or cause errors', () => {
      const controller = new AbortController();
      const handler = jest.fn();
      bus.on('single', handler, { signal: controller.signal });
      bus.off('single', handler);
      expect(() => controller.abort()).not.toThrow();
    });

    test('aborting after off() does not call the handler', () => {
      const controller = new AbortController();
      const handler = jest.fn();
      bus.on('single', handler, { signal: controller.signal });
      bus.off('single', handler);
      controller.abort();
      bus.emit('single', 1);
      expect(handler).not.toHaveBeenCalled();
    });
  });
});
