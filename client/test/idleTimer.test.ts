import createIdleTimer from '../src/utils/idleTimer';
import appEventBus from '../src/events/app-event-bus';

describe('idle timer', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    appEventBus.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
    appEventBus.clear();
  });

  test('marks idle after threshold and resets on command', () => {
    const timer = createIdleTimer(1000);
    expect(timer.isIdle()).toBe(false);
    jest.setSystemTime(999);
    expect(timer.isIdle()).toBe(false);
    jest.setSystemTime(1000);
    expect(timer.isIdle()).toBe(true);
    appEventBus.emit('command', 'look');
    expect(timer.isIdle()).toBe(false);
    jest.setSystemTime(1999);
    expect(timer.isIdle()).toBe(false);
    jest.setSystemTime(2000);
    expect(timer.isIdle()).toBe(true);
  });
});
