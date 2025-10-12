import LampTimer from '../src/LampTimer';
import { uiStore, __uiStoreTestApi } from '../src/ui/store';

describe('LampTimer', () => {
  let container: HTMLElement;

  beforeEach(() => {
    __uiStoreTestApi?.resetUiStoreForTesting();
    document.body.innerHTML = '<div id="lamp-timer"></div>';
    container = document.getElementById('lamp-timer')!;
    new LampTimer();
  });

  test('hides timer when no time', () => {
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
    expect(container.className).toBe('');

    uiStore.setState({ lampTimer: 30 });
    uiStore.setState({ lampTimer: null });
    expect(container.style.display).toBe('none');
    expect(container.textContent).toBe('');
    expect(container.className).toBe('');
  });

  test('updates display and class based on time', () => {
    uiStore.setState({ lampTimer: 65 });
    expect(container.textContent).toBe('lamp 1:05');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('green');

    uiStore.setState({ lampTimer: 55 });
    expect(container.className).toBe('yellow');

    uiStore.setState({ lampTimer: 25 });
    expect(container.className).toBe('red');
  });
});
