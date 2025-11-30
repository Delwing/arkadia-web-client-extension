import ReleaseGuardTimer from '@web/ReleaseGuardTimer';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit = jest.fn((event: string, ...args: any[]) => {
    (this.events[event] || []).forEach(fn => fn(...args));
  });
}

describe('ReleaseGuardTimer', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<span id="release-guard-timer"></span>';
    container = document.getElementById('release-guard-timer')!;
    client = new MockClient();
    new ReleaseGuardTimer(client as any);
  });

  test('displays initial state with guard ON and timer OK', () => {
    expect(container.textContent).toContain('Pusc');
    expect(container.textContent).toContain('Zas:');
    expect(container.textContent).toContain('OK');
    expect(container.style.display).toBe('block');
    expect(container.style.cursor).toBe('pointer');

    // Pusc should be white when active
    const spans = container.querySelectorAll('span');
    expect(spans[0].textContent).toBe('Pusc');
    expect(spans[0].style.color).toBe('white');
  });

  test('updates guard state display', () => {
    client.emit('releaseGuard', false);

    // Pusc should be dimgray when inactive
    const spans = container.querySelectorAll('span');
    expect(spans[0].textContent).toBe('Pusc');
    expect(spans[0].style.color).toBe('dimgray');
  });

  test('click anywhere on element toggles guard state', () => {
    container.click();

    // Click emits event, state updates through event handler
    expect(client.emit).toHaveBeenLastCalledWith('releaseGuard', false);
    // After emit, Pusc should be dimgray
    let spans = container.querySelectorAll('span');
    expect(spans[0].style.color).toBe('dimgray');

    container.click();
    expect(client.emit).toHaveBeenLastCalledWith('releaseGuard', true);
    spans = container.querySelectorAll('span');
    expect(spans[0].style.color).toBe('white');
  });

  test('shows timer countdown when coverTimer event is emitted', () => {
    client.emit('coverTimer', 4.567);

    expect(container.textContent).toContain('Pusc');
    expect(container.textContent).toContain('4.57');
    expect(container.textContent).toContain('Zas:');
  });

  test('shows OK when timer is null or 0', () => {
    // Start with countdown
    client.emit('coverTimer', 2.0);
    expect(container.textContent).toContain('2.00');

    // End timer
    client.emit('coverTimer', null);
    expect(container.textContent).toContain('OK');
  });

  test('guard toggle works independently of timer state', () => {
    // Start countdown
    client.emit('coverTimer', 3.5);

    // Toggle guard - should still show countdown
    client.emit('releaseGuard', false);

    const spans = container.querySelectorAll('span');
    expect(spans[0].style.color).toBe('dimgray');
    expect(container.textContent).toContain('3.50');
  });
});
