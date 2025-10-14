import AttackMode from '../src/AttackMode';
import appEventBus from '@client/src/events/app-event-bus';

jest.mock('@client/src/storage.ts', () => ({
  getItemSync: jest.fn(() => ({})),
}));
import { getItemSync } from '@client/src/storage.ts';

class MockClient {}

describe('AttackMode', () => {
  let container: HTMLElement;
  let client: MockClient;
  let emitSpy: jest.SpyInstance;

  beforeEach(() => {
    appEventBus.clear();
    document.body.innerHTML = '<span id="attack-mode"></span>';
    container = document.getElementById('attack-mode')!;
    client = new MockClient();
    (getItemSync as jest.Mock).mockReturnValue({ attack_mode: 'A' });
    (window as any).clientExtension = { TeamManager: { isLeader: jest.fn(() => true) } };
    emitSpy = jest.spyOn(appEventBus, 'emit');
    new AttackMode(client as any);
  });

  afterEach(() => {
    emitSpy.mockRestore();
  });

  test('updates mode display', () => {
    expect(container.textContent).toBe('Atk: A');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('A');

    appEventBus.emit('attackMode', 'AW');
    expect(container.textContent).toBe('Atk: AW');
    expect(container.className).toBe('AW');
  });

  test('click cycles mode and emits event', () => {
    emitSpy.mockClear();

    container.click();
    expect(emitSpy).toHaveBeenLastCalledWith('attackMode', 'AW');
    expect(container.textContent).toBe('Atk: AW');

    container.click();
    expect(emitSpy).toHaveBeenLastCalledWith('attackMode', 'AWR');
    expect(container.textContent).toBe('Atk: AWR');

    container.click();
    expect(emitSpy).toHaveBeenLastCalledWith('attackMode', 'A');
    expect(container.textContent).toBe('Atk: A');
  });

  test('hides when not leader', () => {
    document.body.innerHTML = '<span id="attack-mode"></span>';
    container = document.getElementById('attack-mode')!;
    client = new MockClient();
    (window as any).clientExtension = { TeamManager: { isLeader: jest.fn(() => false) } };
    appEventBus.clear();
    new AttackMode(client as any);
    expect(container.style.display).toBe('none');
    (window as any).clientExtension.TeamManager.isLeader.mockReturnValue(true);
    appEventBus.emit('teamChange');
    expect(container.style.display).toBe('block');
  });
});
