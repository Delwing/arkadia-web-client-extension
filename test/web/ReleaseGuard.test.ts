import ReleaseGuard from '@web/ReleaseGuard';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit = jest.fn((event: string, ...args: any[]) => {
    (this.events[event] || []).forEach(fn => fn(...args));
  });
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

  test('click toggles state and emits event', () => {
    container.click();
    expect(client.emit).toHaveBeenLastCalledWith('releaseGuard', false);
    expect(container.textContent).toBe('Pusc zas: off');

    container.click();
    expect(client.emit).toHaveBeenLastCalledWith('releaseGuard', true);
    expect(container.textContent).toBe('Pusc zas: on');
  });
});
