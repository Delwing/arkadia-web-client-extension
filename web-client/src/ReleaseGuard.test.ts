import ReleaseGuard from './ReleaseGuard';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, ...args: any[]) {
    (this.events[event] || []).forEach(fn => fn(...args));
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
    client.emit('releaseGuard', true);
    expect(container.textContent).toBe('guard ON');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('on');

    client.emit('releaseGuard', false);
    expect(container.textContent).toBe('guard OFF');
    expect(container.className).toBe('off');
  });
});
