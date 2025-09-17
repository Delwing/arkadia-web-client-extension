import initMoveMode from '../src/scripts/moveMode';

class FakeClient {
  moveMode = 0;
  carriageMode = false;
  moveModeButton?: HTMLInputElement;
  moveModeBind = { key: 'Backquote' } as { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean };
  println = jest.fn();
  sendEvent = jest.fn();
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
    expect(client.println).toHaveBeenCalledWith('Tryb ruchu: przemknij');
    client.println.mockClear();

    client.carriageMode = true;
    const ev2 = new KeyboardEvent('keydown', { key: '`', code: 'Backquote', cancelable: true });
    window.dispatchEvent(ev2);
    expect(client.moveMode).toBe(1);
    expect(client.println).not.toHaveBeenCalled();
  });

  test('custom bind cycles move mode', () => {
    const client = new FakeClient();
    client.moveModeBind = { key: 'KeyM', shift: true };
    initMoveMode((client as unknown) as any);
    const ev = new KeyboardEvent('keydown', { key: 'M', code: 'KeyM', shiftKey: true, cancelable: true });
    const result = window.dispatchEvent(ev);
    expect(result).toBe(false);
    expect(client.moveMode).toBe(1);
    expect(client.println).toHaveBeenCalledWith('Tryb ruchu: przemknij');
  });

  test('button toggles move mode without printing', () => {
    const client = new FakeClient();
    initMoveMode((client as unknown) as any);
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(1);
    expect(client.println).not.toHaveBeenCalled();
  });
});
