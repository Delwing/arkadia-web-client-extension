import CoverTimer from '../src/CoverTimer';
import { uiStore, __uiStoreTestApi } from '../src/ui/store';

describe('CoverTimer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    __uiStoreTestApi?.resetUiStoreForTesting();
    document.body.innerHTML = '<span id="cover-timer"></span>';
    container = document.getElementById('cover-timer')!;
    new CoverTimer();
  });

  test('shows ready when no time', () => {
    expect(container.textContent).toBe('Zas: OK');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('green');

    uiStore.setState({ coverTimer: 2 });
    uiStore.setState({ coverTimer: null });
    expect(container.textContent).toBe('Zas: OK');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('green');
  });

  test('shows time with two decimals', () => {
    uiStore.setState({ coverTimer: 4.567 });
    expect(container.textContent).toBe('Zas: 4.57');
    expect(container.className).toBe('yellow');
  });
});
