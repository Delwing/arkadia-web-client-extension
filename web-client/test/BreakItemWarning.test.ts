import BreakItemWarning from '../src/BreakItemWarning';
import appEventBus from '@client/src/events/app-event-bus';

class MockClient {
  sendCommand = jest.fn();
}

describe('BreakItemWarning', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    appEventBus.clear();
    document.body.innerHTML = '<div id="break-item-warning"></div>';
    container = document.getElementById('break-item-warning')!;
    client = new MockClient();
    new BreakItemWarning(client as any);
  });

  test('hides on null data', () => {
    appEventBus.emit('breakItem', null);
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
  });

  test('shows text and executes command on click', () => {
    appEventBus.emit('breakItem', { text: 'Warning!', command: 'run' });
    expect(container.textContent).toBe('Warning!');
    expect(container.style.display).toBe('block');
    container.click();
    expect(client.sendCommand).toHaveBeenCalledWith('run');
    expect(container.style.display).toBe('none');
  });

  test('handles click with no command', () => {
    appEventBus.emit('breakItem', { text: 'Only text' });
    container.click();
    expect(client.sendCommand).not.toHaveBeenCalled();
    expect(container.style.display).toBe('none');
  });
});
