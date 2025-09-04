import AttackMode from '../src/AttackMode';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit = jest.fn((event: string, ...args: any[]) => {
    (this.events[event] || []).forEach(fn => fn(...args));
  });
}

describe('AttackMode', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<span id="attack-mode"></span>';
    container = document.getElementById('attack-mode')!;
    client = new MockClient();
    new AttackMode(client as any);
  });

  test('updates mode display', () => {
    expect(container.textContent).toBe('Atk: A');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('A');

    client.emit('attackMode', 'AW');
    expect(container.textContent).toBe('Atk: AW');
    expect(container.className).toBe('AW');
  });

  test('click cycles mode and emits event', () => {
    container.click();
    expect(client.emit).toHaveBeenLastCalledWith('attackMode', 'AW');
    expect(container.textContent).toBe('Atk: AW');

    container.click();
    expect(client.emit).toHaveBeenLastCalledWith('attackMode', 'AWR');
    expect(container.textContent).toBe('Atk: AWR');

    container.click();
    expect(client.emit).toHaveBeenLastCalledWith('attackMode', 'A');
    expect(container.textContent).toBe('Atk: A');
  });
});
