import ReleaseGuard from './ReleaseGuard';

class MockClient {
  private events: Record<string, Function[]> = {};
  emit = jest.fn((event: string, ...args: any[]) => {
    (this.events[event] || []).forEach(fn => fn(...args));
  });
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
}

describe('ReleaseGuard', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<span id="release-guard"></span>';
    container = document.getElementById('release-guard')!;
    client = new MockClient();
    new ReleaseGuard(client as any);
  });

  test('updates state display', () => {
    // initial state should be visible
    expect(container.textContent).toBe('Pusc zas: on');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('on');

    client.emit('releaseGuard', false);
    expect(container.textContent).toBe('Pusc zas: off');
    expect(container.className).toBe('off');
  });

  test('toggles state on click and emits event', () => {
    container.click();
    expect(container.textContent).toBe('Pusc zas: off');
    expect(client.emit).toHaveBeenLastCalledWith('releaseGuard', false);
    container.click();
    expect(container.textContent).toBe('Pusc zas: on');
    expect(client.emit).toHaveBeenLastCalledWith('releaseGuard', true);
  });
});
