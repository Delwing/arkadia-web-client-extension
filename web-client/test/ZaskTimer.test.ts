import ZaskTimer from '../src/ZaskTimer';
import { uiStore, __uiStoreTestApi } from '../src/ui/store';

describe('ZaskTimer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    __uiStoreTestApi?.resetUiStoreForTesting();
    document.body.innerHTML = '<div id="zask-timer"></div>';
    container = document.getElementById('zask-timer')!;
    new ZaskTimer();
  });

  test('hides timer when no payload', () => {
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
    expect(container.className).toBe('');

    uiStore.setState({ zaskTimer: { seconds: 5, ok: false } });
    expect(container.style.display).toBe('block');
    expect(container.textContent).toBe('Zask: 5');
    expect(container.className).toBe('red');

    uiStore.setState({ zaskTimer: null });
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
    expect(container.className).toBe('');
  });

  test('shows green state when ok', () => {
    uiStore.setState({ zaskTimer: { seconds: 30, ok: true } });
    expect(container.style.display).toBe('block');
    expect(container.textContent).toBe('Zask: OK');
    expect(container.className).toBe('green');
  });

  test('shows yellow when nearing safe threshold', () => {
    uiStore.setState({ zaskTimer: { seconds: 25, ok: false } });
    expect(container.style.display).toBe('block');
    expect(container.textContent).toBe('Zask: 25');
    expect(container.className).toBe('yellow');
  });
});
