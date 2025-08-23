import initMoveMode from '../src/scripts/moveMode';

class FakeClient {
  moveMode = 0;
  carriageMode = false;
  moveModeButton?: HTMLInputElement;
  moveModeBind = { key: 'Backquote' } as { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean };
  createButton(_name: string, callback: () => void) {
    const btn = document.createElement('input');
    btn.type = 'button';
    btn.onclick = callback;
    return btn;
  }
}

describe('move mode default bind', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('backquote cycles move mode and respects carriage mode', () => {
    const client = new FakeClient();
    initMoveMode((client as unknown) as any);
    const ev = new KeyboardEvent('keydown', { key: '`', code: 'Backquote', cancelable: true });
    const result = window.dispatchEvent(ev);
    expect(result).toBe(false);
    expect(client.moveMode).toBe(1);

    client.carriageMode = true;
    const ev2 = new KeyboardEvent('keydown', { key: '`', code: 'Backquote', cancelable: true });
    window.dispatchEvent(ev2);
    expect(client.moveMode).toBe(1);
  });

  test('custom bind cycles move mode', () => {
    const client = new FakeClient();
    client.moveModeBind = { key: 'KeyM', shift: true };
    initMoveMode((client as unknown) as any);
    const ev = new KeyboardEvent('keydown', { key: 'M', code: 'KeyM', shiftKey: true, cancelable: true });
    const result = window.dispatchEvent(ev);
    expect(result).toBe(false);
    expect(client.moveMode).toBe(1);
  });
});
