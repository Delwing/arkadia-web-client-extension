import CoverTimer from './CoverTimer';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, ...args: any[]) {
    (this.events[event] || []).forEach(fn => fn(...args));
  }
}

describe('CoverTimer', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<span id="cover-timer"></span>';
    container = document.getElementById('cover-timer')!;
    client = new MockClient();
    new CoverTimer(client as any);
  });

  test('shows ready when no time', () => {
    client.emit('coverTimer', null);
    expect(container.textContent).toBe('cover');
    expect(container.style.display).toBe('block');
  });

  test('shows time with two decimals', () => {
    client.emit('coverTimer', 4.567);
    expect(container.textContent).toBe('cover 4.57');
  });
});
