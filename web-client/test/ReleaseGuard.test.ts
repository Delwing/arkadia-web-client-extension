import ReleaseGuard from '../src/ReleaseGuard';
import appEventBus from '@client/src/events/app-event-bus.ts';

describe('ReleaseGuard', () => {
  let container: HTMLElement;

  beforeEach(() => {
    appEventBus.clear();
    document.body.innerHTML = '<span id="release-guard"></span>';
    container = document.getElementById('release-guard')!;
    new ReleaseGuard({} as any);
  });

  afterEach(() => {
    appEventBus.clear();
  });

  test('updates state display', () => {
    // initial state should be visible
    expect(container.textContent).toBe('Pusc zas: on');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('on');

    appEventBus.emit('releaseGuard', false);
    expect(container.textContent).toBe('Pusc zas: off');
    expect(container.className).toBe('off');
  });

  test('click toggles state and emits event', () => {
    const emitSpy = jest.spyOn(appEventBus, 'emit');

    container.click();
    expect(emitSpy).toHaveBeenNthCalledWith(1, 'releaseGuard', false);
    expect(container.textContent).toBe('Pusc zas: off');

    container.click();
    expect(emitSpy).toHaveBeenNthCalledWith(2, 'releaseGuard', true);
    expect(container.textContent).toBe('Pusc zas: on');

    emitSpy.mockRestore();
  });
});
