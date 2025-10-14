import CharStateInfo from '../src/CharStateInfo';
import appEventBus from '@client/src/events/app-event-bus.ts';

describe('CharStateInfo', () => {
  let container: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '<span id="state-info"></span>';
    container = document.getElementById('state-info')!;
    appEventBus.clear();
    new CharStateInfo({} as any);
  });

  test('hides when no state text', () => {
    appEventBus.emit('gmcp.char.state', {} as any);
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
  });

  test('shows state text', () => {
    appEventBus.emit('gmcp.char.state', { state: 'swietny' } as any);
    expect(container.textContent).toBe('swietny');
    expect(container.style.display).toBe('block');
  });

  afterEach(() => {
    appEventBus.clear();
  });
});
