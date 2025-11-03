import AttackMode from '../src/AttackMode';
import eventBus from '@client/src/eventBus.ts';
import { getClientInstance, setClientInstance, clearClientInstance } from "@shared/runtime";

jest.mock('@client/src/storage.ts', () => ({
  getItemSync: jest.fn(() => ({})),
}));
import { getItemSync } from '@client/src/storage.ts';

const emitIsLeaderEvent = () => {
  const isLeader = Boolean(getClientInstance()?.TeamManager?.isLeader?.());
  eventBus.emit('isTeamLeader', isLeader);
};

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit = jest.fn((event: string, ...args: any[]) => {
    (this.events[event] || []).forEach(fn => fn(...args));
    (eventBus.emit as (...emitArgs: any[]) => number)(event, ...args);
    if (event === 'teamChange') {
      emitIsLeaderEvent();
    }
  });
}

describe('AttackMode', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    eventBus.clear();
    clearClientInstance();
    document.body.innerHTML = '<span id="attack-mode"></span>';
    container = document.getElementById('attack-mode')!;
    client = new MockClient();
    (getItemSync as jest.Mock).mockReturnValue({ attack_mode: 'A' });
    setClientInstance({ TeamManager: { isLeader: jest.fn(() => true), isInAnyTeam: jest.fn(() => true) } } as any);
    new AttackMode(client as any);
    emitIsLeaderEvent();
  });

  test('updates mode display', () => {
    expect(container.textContent).toBe('Atk: A');
    expect(container.style.display).toBe('block');
    expect(container.className).toBe('A');

    client.emit('attackMode', 'AW');
    expect(container.textContent).toBe('Atk: AW');
    expect(container.className).toBe('AW');
  });

  test('click cycles mode and emits event', () => {
    container.click();
    expect(client.emit).toHaveBeenLastCalledWith('attackMode', 'AW');
    expect(container.textContent).toBe('Atk: AW');

    container.click();
    expect(client.emit).toHaveBeenLastCalledWith('attackMode', 'AWR');
    expect(container.textContent).toBe('Atk: AWR');

    container.click();
    expect(client.emit).toHaveBeenLastCalledWith('attackMode', 'A');
    expect(container.textContent).toBe('Atk: A');
  });

  test('hides when not leader', () => {
    document.body.innerHTML = '<span id="attack-mode"></span>';
    container = document.getElementById('attack-mode')!;
    client = new MockClient();
    setClientInstance({ TeamManager: { isLeader: jest.fn(() => false), isInAnyTeam: jest.fn(() => true) } } as any);
    new AttackMode(client as any);
    emitIsLeaderEvent();
    expect(container.style.display).toBe('none');
    const instance = getClientInstance();
    (instance?.TeamManager?.isLeader as jest.Mock)?.mockReturnValue(true);
    client.emit('teamChange');
    expect(container.style.display).toBe('block');
  });

  afterEach(() => {
    clearClientInstance();
  });
});
