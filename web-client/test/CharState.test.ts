import CharState from '../src/CharState';
import { runtimeEventHub } from '@client/src/runtime/event-hub';
import { resetUiStoreForTesting } from './utils/uiStoreTestUtils';

describe('CharState', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="char-state" data-footer-mode="3"><span id="char-state-text"></span><div id="char-state-bars"></div></div>';
    resetUiStoreForTesting();
    new CharState({} as any);
  });

  test('progress values stay white in graphical mode', () => {
    runtimeEventHub.emit('gmcp', { path: 'char.state', value: { hp: 5 } });
    const valueSpan = document.querySelector('#char-state-bars .progress-value') as HTMLElement;
    expect(valueSpan).not.toBeNull();
    expect(valueSpan.style.color).toBe('white');
  });

  test('form is hidden when gmcp option disables form', () => {
    runtimeEventHub.emit('gmcp', { path: 'char.state', value: { form: 0 } });
    let formBar = document.querySelector('#char-state-bars .char-state-bar[title="form"]');
    expect(formBar).not.toBeNull();
    runtimeEventHub.emit('gmcp', { path: 'char.options', value: { form: 0 } });
    formBar = document.querySelector('#char-state-bars .char-state-bar[title="form"]');
    expect(formBar).toBeNull();
  });
});
