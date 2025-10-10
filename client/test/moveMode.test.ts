import initMoveMode from '../src/scripts/moveMode';

class FakeClient extends EventTarget {
  moveMode = 0;
  carriageMode = false;
  moveModeButton?: HTMLInputElement | HTMLButtonElement;
  moveModeBind = { key: 'Backquote' } as { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean };
  println = jest.fn();
  sendEvent = jest.fn();
  leader = false;
  TeamManager = {
    isLeader: () => this.leader,
  };
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

  test('move mode button skips team sneak when not leader', () => {
    const client = new FakeClient();
    initMoveMode((client as unknown) as any);
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(1);
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(0);
  });

  test('leader can cycle through team sneak mode', () => {
    const client = new FakeClient();
    client.leader = true;
    initMoveMode((client as unknown) as any);
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(1);
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(2);
  });

  test('losing leadership resets team sneak mode', () => {
    const client = new FakeClient();
    client.leader = true;
    initMoveMode((client as unknown) as any);
    client.moveModeButton!.click();
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(2);
    client.sendEvent.mockClear();

    client.leader = false;
    client.dispatchEvent(new Event('teamChange'));

    expect(client.moveMode).toBe(1);
    expect(client.moveModeButton!.value).toBe('Ruch: prz');
    expect(client.sendEvent).toHaveBeenLastCalledWith('moveModeChanged', 1);
  });

  test('combat gmcp resets move mode to normal', () => {
    const client = new FakeClient();
    client.leader = true;
    initMoveMode((client as unknown) as any);
    client.moveModeButton!.click();
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(2);
    client.sendEvent.mockClear();

    client.dispatchEvent(new CustomEvent('gmcp.char.info', { detail: { object_num: 5 } }));
    client.dispatchEvent(new CustomEvent('gmcp.objects.data', { detail: { '5': { attack_num: false } } }));
    expect(client.moveMode).toBe(2);

    client.dispatchEvent(new CustomEvent('gmcp.objects.data', { detail: { '5': { attack_num: true } } }));
    expect(client.moveMode).toBe(0);
    expect(client.moveModeButton!.value).toBe('Ruch: zwykly');
    expect(client.sendEvent).toHaveBeenLastCalledWith('moveModeChanged', 0);
    expect(client.println).not.toHaveBeenCalled();
  });

  test('combat gmcp resets move mode mobile button label', () => {
    const client = new FakeClient();
    client.leader = true;
    initMoveMode((client as unknown) as any);
    const mobileButton = document.createElement('button');
    mobileButton.dataset.moveModeLabel = 'Tryb ruchu';
    mobileButton.textContent = 'Tryb ruchu prz dr';
    mobileButton.title = 'Tryb ruchu przemknij z druzyna';
    client.moveModeButton = mobileButton;
    client.moveMode = 2;
    client.dispatchEvent(new CustomEvent('gmcp.char.info', { detail: { object_num: 7 } }));

    client.dispatchEvent(new CustomEvent('gmcp.objects.data', { detail: { '7': { attack_num: true } } }));

    expect(client.moveMode).toBe(0);
    expect(mobileButton.textContent).toBe('Tryb ruchu zwykly');
    expect(mobileButton.title).toBe('Tryb ruchu zwykly');
  });
});
