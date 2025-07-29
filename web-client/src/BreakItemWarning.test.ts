import BreakItemWarning from './BreakItemWarning';

class MockClient {
  private events: Record<string, Function[]> = {};
  sendCommand = jest.fn();
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, ...args: any[]) {
    (this.events[event] || []).forEach(fn => fn(...args));
  }
}

describe('BreakItemWarning', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<div id="break-item-warning"></div>';
    container = document.getElementById('break-item-warning')!;
    client = new MockClient();
    new BreakItemWarning(client as any);
  });

  test('hides on null data', () => {
    client.emit('breakItem', null);
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
  });

  test('shows text and executes command on click', () => {
    client.emit('breakItem', { text: 'Warning!', command: 'run' });
    expect(container.textContent).toBe('Warning!');
    expect(container.style.display).toBe('block');
    container.click();
    expect(client.sendCommand).toHaveBeenCalledWith('run');
    expect(container.style.display).toBe('none');
  });

  test('handles click with no command', () => {
    client.emit('breakItem', { text: 'Only text' });
    container.click();
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(container.style.display).toBe('none');
  });
});
