import CoverTimer from '../src/CoverTimer';
import appEventBus from '@client/src/events/app-event-bus';

class MockClient {}

describe('CoverTimer', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    appEventBus.clear();
    document.body.innerHTML = '<span id="cover-timer"></span>';
    container = document.getElementById('cover-timer')!;
    client = new MockClient();
    new CoverTimer(client as any);
  });

  test('shows ready when no time', () => {
    appEventBus.emit('coverTimer', null);
    expect(container.textContent).toBe('Zas: OK');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('green');
  });

  test('shows time with two decimals', () => {
    appEventBus.emit('coverTimer', 4.567);
    expect(container.textContent).toBe('Zas: 4.57');
    expect(container.className).toBe('yellow');
  });
});
