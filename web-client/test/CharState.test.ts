import CharState from '../src/CharState';
import appEventBus from '@client/src/events/app-event-bus';

describe('CharState', () => {
  beforeEach(() => {
    appEventBus.clear();
    document.body.innerHTML = '<div id="char-state" data-footer-mode="3"><span id="char-state-text"></span><div id="char-state-bars"></div></div>';
    new CharState();
  });

  test('progress values stay white in graphical mode', () => {
    appEventBus.emit('gmcp.char.state', { hp: 5 });
    const valueSpan = document.querySelector('#char-state-bars .progress-value') as HTMLElement;
    expect(valueSpan).not.toBeNull();
    expect(valueSpan.style.color).toBe('white');
  });

  test('form is hidden when gmcp option disables form', () => {
    appEventBus.emit('gmcp.char.state', { form: 0 });
    let formBar = document.querySelector('#char-state-bars .char-state-bar[title="form"]');
    expect(formBar).not.toBeNull();
    appEventBus.emit('gmcp.char.options', { form: 0 });
    formBar = document.querySelector('#char-state-bars .char-state-bar[title="form"]');
    expect(formBar).toBeNull();
  });
});
