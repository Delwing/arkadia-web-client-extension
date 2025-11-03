import CharStateInfo from '@web/CharStateInfo';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, ...args: any[]) {
    (this.events[event] || []).forEach(fn => fn(...args));
  }
}

describe('CharStateInfo', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<span id="state-info"></span>';
    container = document.getElementById('state-info')!;
    client = new MockClient();
    new CharStateInfo(client as any);
  });

  test('hides when no state text', () => {
    client.emit('gmcp.char.state', {});
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
  });

  test('shows state text', () => {
    client.emit('gmcp.char.state', { state: 'swietny' });
    expect(container.textContent).toBe('swietny');
    expect(container.style.display).toBe('block');
  });
});
