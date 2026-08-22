import initMoveMode from '@client/scripts/moveMode';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

import { EventEmitter } from 'events';
import { FakeClientBase } from '../helpers/fakeClient';

class FakeClient extends FakeClientBase {
  private emitter = new EventEmitter();
  moveMode = 0;
  carriageMode = false;
  moveModeButton?: HTMLInputElement | HTMLButtonElement;
  moveModeBind = { key: 'Backquote' } as { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean };
  println = jest.fn();
  sendEvent = jest.fn((type: string, detail?: any) => {
    this.emitter.emit(type, detail);
  });
  leader = false;
  TeamManager = {
    isLeader: () => this.leader,
  };
  Map: { moveBack: jest.Mock; setBlockable: jest.Mock; isBlockable: boolean };
  Triggers: Triggers;

  constructor() {
    super();
    const self = this;
    this.Map = {
      moveBack: jest.fn(),
      setBlockable: jest.fn((value: boolean) => {
        self.Map.isBlockable = value;
      }),
      isBlockable: false,
    };
    this.Triggers = new Triggers(({} as unknown) as any);
  }
  on(event: string, cb: (payload: any) => void) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }
  dispatchEvent(event: Event) {
    const payload = (event as CustomEvent).detail;
    this.emitter.emit(event.type, payload);
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
    const btn = document.createElement('input');
    btn.type = 'button';
    client.moveModeButton = btn;
    initMoveMode((client as unknown) as any);
    btn.onclick = () => {
      const available = client.leader ? 3 : 2;
      client.moveMode = (client.moveMode + 1) % available;
      client.sendEvent('moveModeChanged', client.moveMode);
    };
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(1);
    expect(client.println).not.toHaveBeenCalled();
  });

  test('move mode button skips team sneak when not leader', () => {
    const client = new FakeClient();
    const btn = document.createElement('input');
    btn.type = 'button';
    client.moveModeButton = btn;
    initMoveMode((client as unknown) as any);
    btn.onclick = () => {
      const available = client.leader ? 3 : 2;
      client.moveMode = (client.moveMode + 1) % available;
      client.sendEvent('moveModeChanged', client.moveMode);
    };
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(1);
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(0);
  });

  test('leader can cycle through team sneak mode', () => {
    const client = new FakeClient();
    client.leader = true;
    const btn = document.createElement('input');
    btn.type = 'button';
    client.moveModeButton = btn;
    initMoveMode((client as unknown) as any);
    btn.onclick = () => {
      const available = client.leader ? 3 : 2;
      client.moveMode = (client.moveMode + 1) % available;
      client.sendEvent('moveModeChanged', client.moveMode);
    };
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(1);
    client.moveModeButton!.click();
    expect(client.moveMode).toBe(2);
  });

  test('losing leadership resets team sneak mode', () => {
    const client = new FakeClient();
    client.leader = true;
    const btn = document.createElement('input');
    btn.type = 'button';
    client.moveModeButton = btn;
    initMoveMode((client as unknown) as any);
    btn.onclick = () => {
      const available = client.leader ? 3 : 2;
      client.moveMode = (client.moveMode + 1) % available;
      client.sendEvent('moveModeChanged', client.moveMode);
    };
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
    const btn = document.createElement('input');
    btn.type = 'button';
    client.moveModeButton = btn;
    initMoveMode((client as unknown) as any);
    btn.onclick = () => {
      const available = client.leader ? 3 : 2;
      client.moveMode = (client.moveMode + 1) % available;
      client.sendEvent('moveModeChanged', client.moveMode);
    };
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

describe('przemknij cooldown step back', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    document.body.innerHTML = '';
    client = new FakeClient();
    initMoveMode((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  const cooldownLine = 'Ochlon chociaz chwile od walki...';

  test('does not move back when in normal move mode', () => {
    client.moveMode = 0;
    client.Map.isBlockable = true;

    parse(cooldownLine);

    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('does not move back when movement is not blockable', () => {
    client.moveMode = 1;
    client.Map.isBlockable = false;

    parse(cooldownLine);

    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('moves back when in przemknij mode and blockable', () => {
    client.moveMode = 1;
    client.Map.isBlockable = true;

    parse(cooldownLine);

    expect(client.Map.moveBack).toHaveBeenCalled();
    expect(client.Map.setBlockable).toHaveBeenCalledWith(false);
  });

  test('moves back when in przemknij z druzyna mode and blockable', () => {
    client.moveMode = 2;
    client.Map.isBlockable = true;

    parse(cooldownLine);

    expect(client.Map.moveBack).toHaveBeenCalled();
    expect(client.Map.setBlockable).toHaveBeenCalledWith(false);
  });
});

describe('przemknij z druzyna no team step back', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    document.body.innerHTML = '';
    client = new FakeClient();
    initMoveMode((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  const noTeamLine = 'Nie ma przy tobie nikogo z twojej druzyny.';

  test('does not move back when in normal move mode', () => {
    client.moveMode = 0;
    client.Map.isBlockable = true;

    parse(noTeamLine);

    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('does not move back when in przemknij mode', () => {
    client.moveMode = 1;
    client.Map.isBlockable = true;

    parse(noTeamLine);

    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('does not move back when movement is not blockable', () => {
    client.moveMode = 2;
    client.Map.isBlockable = false;

    parse(noTeamLine);

    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('moves back when in przemknij z druzyna mode and blockable', () => {
    client.moveMode = 2;
    client.Map.isBlockable = true;

    parse(noTeamLine);

    expect(client.Map.moveBack).toHaveBeenCalled();
    expect(client.Map.setBlockable).toHaveBeenCalledWith(false);
  });
});
