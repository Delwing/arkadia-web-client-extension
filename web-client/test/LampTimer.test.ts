import LampTimer from '../src/LampTimer';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, ...args: any[]) {
    (this.events[event] || []).forEach(fn => fn(...args));
  }
}

describe('LampTimer', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<div id="lamp-timer"></div>';
    container = document.getElementById('lamp-timer')!;
    client = new MockClient();
    new LampTimer(client as any);
  });

  test('hides timer when no time', () => {
    client.emit('lampTimer', null);
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
    expect(container.className).toBe('');
  });

  test('updates display and class based on time', () => {
    client.emit('lampTimer', 65);
    expect(container.textContent).toBe('lamp 1:05');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('green');

    client.emit('lampTimer', 55);
    expect(container.className).toBe('yellow');

    client.emit('lampTimer', 25);
    expect(container.className).toBe('red');
  });
});
