import initMoveMode from '../src/scripts/moveMode';
import appEventBus from '../src/events/app-event-bus';

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
    appEventBus.clear();
  });

  afterEach(() => {
    appEventBus.clear();
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

  test('team change clamps move mode when not leader', () => {
    const client = new FakeClient();
    initMoveMode((client as unknown) as any);
    const emitSpy = jest.spyOn(appEventBus, 'emit');
    client.moveMode = 2;

    appEventBus.emit('teamChange');

    expect(client.moveMode).toBe(1);
    expect(emitSpy).toHaveBeenCalledWith('moveModeChanged', 1);
    emitSpy.mockRestore();
  });

  test('leader can cycle through team sneak mode', () => {
    const client = new FakeClient();
    client.leader = true;
    initMoveMode((client as unknown) as any);
    const ev = new KeyboardEvent('keydown', { key: '`', code: 'Backquote', cancelable: true });
    window.dispatchEvent(ev);
    const ev2 = new KeyboardEvent('keydown', { key: '`', code: 'Backquote', cancelable: true });
    window.dispatchEvent(ev2);

    expect(client.moveMode).toBe(2);
  });

  test('losing leadership resets team sneak mode', () => {
    const client = new FakeClient();
    client.leader = true;
    initMoveMode((client as unknown) as any);
    const ev = new KeyboardEvent('keydown', { key: '`', code: 'Backquote', cancelable: true });
    window.dispatchEvent(ev);
    const ev2 = new KeyboardEvent('keydown', { key: '`', code: 'Backquote', cancelable: true });
    window.dispatchEvent(ev2);
    expect(client.moveMode).toBe(2);

    const emitSpy = jest.spyOn(appEventBus, 'emit');
    emitSpy.mockClear();

    client.leader = false;
    appEventBus.emit('teamChange');

    expect(client.moveMode).toBe(1);
    expect(emitSpy).toHaveBeenCalledWith('moveModeChanged', 1);
    emitSpy.mockRestore();
  });

  test('combat gmcp resets move mode to normal', () => {
    const client = new FakeClient();
    client.leader = true;
    initMoveMode((client as unknown) as any);
    const ev = new KeyboardEvent('keydown', { key: '`', code: 'Backquote', cancelable: true });
    window.dispatchEvent(ev);
    const ev2 = new KeyboardEvent('keydown', { key: '`', code: 'Backquote', cancelable: true });
    window.dispatchEvent(ev2);
    expect(client.moveMode).toBe(2);
    client.println.mockClear();
    const emitSpy = jest.spyOn(appEventBus, 'emit');
    emitSpy.mockClear();

    appEventBus.emit('gmcp.char.info', { detail: { object_num: 5 } } as any);
    appEventBus.emit('gmcp.objects.data', { detail: { '5': { attack_num: false } } } as any);
    expect(client.moveMode).toBe(2);

    appEventBus.emit('gmcp.objects.data', { detail: { '5': { attack_num: true } } } as any);
    expect(client.moveMode).toBe(0);
    expect(emitSpy).toHaveBeenCalledWith('moveModeChanged', 0);
    expect(client.println).not.toHaveBeenCalled();
    emitSpy.mockRestore();
  });
});
