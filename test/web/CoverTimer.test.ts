import CoverTimer from '@web/CoverTimer';

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
    expect(container.textContent).toBe('Zas: OK');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('green');
  });

  test('shows time with two decimals', () => {
    client.emit('coverTimer', 4.567);
    expect(container.textContent).toBe('Zas: 4.57');
    expect(container.className).toBe('yellow');
  });
});
