import AttackMode from '../src/AttackMode';
import { resetUiStoreForTesting, uiStore } from './utils/uiStoreTestUtils';

jest.mock('@client/src/storage.ts', () => ({
  getItemSync: jest.fn(() => ({})),
}));
import { getItemSync } from '@client/src/storage.ts';

class MockClient {
  private events: Record<string, Function[]> = {};
  on(event: string, listener: Function) {
    (this.events[event] ||= []).push(listener);
  }
  emit = jest.fn((event: string, ...args: any[]) => {
    (this.events[event] || []).forEach(fn => fn(...args));
  });
}

describe('AttackMode', () => {
  let container: HTMLElement;
  let client: MockClient;

  beforeEach(() => {
    resetUiStoreForTesting();
    document.body.innerHTML = '<span id="attack-mode"></span>';
    container = document.getElementById('attack-mode')!;
    client = new MockClient();
    (getItemSync as jest.Mock).mockReturnValue({ attack_mode: 'A' });
    uiStore.setState({ teamStatus: { inTeam: true, isLeader: true, leaderId: '1' } });
    new AttackMode(client as any);
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
    resetUiStoreForTesting();
    uiStore.setState({ teamStatus: { inTeam: false, isLeader: false } });
    new AttackMode(client as any);
    expect(container.style.display).toBe('none');
    uiStore.setState({ teamStatus: { inTeam: true, isLeader: true, leaderId: '1' } });
    client.emit('teamChange');
    expect(container.style.display).toBe('block');
  });
});
