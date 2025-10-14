import LampTimer from '../src/LampTimer';
import appEventBus from '@client/src/events/app-event-bus';

class MockClient {}

describe('LampTimer', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    appEventBus.clear();
    document.body.innerHTML = '<div id="lamp-timer"></div>';
    container = document.getElementById('lamp-timer')!;
    client = new MockClient();
    new LampTimer(client as any);
  });

  test('hides timer when no time', () => {
    appEventBus.emit('lampTimer', null);
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
    expect(container.className).toBe('');
  });

  test('updates display and class based on time', () => {
    appEventBus.emit('lampTimer', 65);
    expect(container.textContent).toBe('lamp 1:05');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('green');

    appEventBus.emit('lampTimer', 55);
    expect(container.className).toBe('yellow');

    appEventBus.emit('lampTimer', 25);
    expect(container.className).toBe('red');
  });
});
