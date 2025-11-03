import CharState from '@web/CharState';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit(event: string, ...args: any[]) {
    (this.events[event] || []).forEach(fn => fn(...args));
  }
}

describe('CharState', () => {
  let client: MockClient;

  beforeEach(() => {
    document.body.innerHTML = '<div id="char-state" data-footer-mode="3"><span id="char-state-text"></span><div id="char-state-bars"></div></div>';
    client = new MockClient();
    new CharState(client as any);
  });

  test('progress values stay white in graphical mode', () => {
    client.emit('gmcp.char.state', { hp: 5 });
    const valueSpan = document.querySelector('#char-state-bars .progress-value') as HTMLElement;
    expect(valueSpan).not.toBeNull();
    expect(valueSpan.style.color).toBe('white');
  });

  test('form is hidden when gmcp option disables form', () => {
    client.emit('gmcp.char.state', { form: 0 });
    let formBar = document.querySelector('#char-state-bars .char-state-bar[title="form"]');
    expect(formBar).not.toBeNull();
    client.emit('gmcp.char.options', { form: 0 });
    formBar = document.querySelector('#char-state-bars .char-state-bar[title="form"]');
    expect(formBar).toBeNull();
  });
});
