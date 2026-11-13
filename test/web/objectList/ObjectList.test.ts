import ObjectList from '@web/objectList/ObjectList';
import { globalStorage } from '@modules/core/storage';
import ObjectManager from '@client/ObjectManager';
import { EventEmitter } from 'events';
import { MockClient } from './support';

vi.mock('@modules/core/storage', async () => (await import('./support')).storageMockModule());

describe('ObjectList', () => {
  beforeEach(() => {
    (globalStorage.get as jest.Mock).mockReset();
    (globalStorage.set as jest.Mock).mockReset();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
  });

  test('shows placeholder when no objects', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    client.ObjectManager.getObjectsOnLocation = () => [];
    (objectList as any).render();
    const content = document.querySelector('#objects-list .objects-list-content') as HTMLElement;
    expect(content.innerHTML).toContain('Brak obiektów');
    expect(content.innerHTML).toContain('font-style: italic');
  });

  test('non team members not fighting are not purple', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    const objects = [
      { shortcut: '1', desc: 'Goblin', hp: 10 },
      { shortcut: '2', desc: 'Orc', hp: 10, attack_num: true },
    ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();
    const descColor = (id: string) =>
      (document.querySelector(`.object-desc[data-object-num="${id}"] span`) as HTMLElement | null)?.style.color ?? '';
    expect(descColor('1')).toBe('');
    expect(descColor('2')).toBe('rgb(177, 156, 217)'); // #b19cd9
  });

  test('highlights next queued enemy number in gold', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    client.TeamManager.getEnemyQueue = () => [123];
    const objectList = new ObjectList(client as any);
    const objects = [
      { shortcut: '1', desc: 'Ork', num: 123 },
      { shortcut: '2', desc: 'Goblin', num: 456 },
    ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();
    const highlighted = document.querySelector(
      '.object-num[data-object-id="123"]',
    ) as HTMLElement;
    expect(highlighted).toBeTruthy();
    expect(highlighted.style.color).toBe('rgb(255, 215, 0)'); // #ffd700
    expect(highlighted.classList.contains('object-num-next-target')).toBe(true);
  });

  test('does not highlight gold when queued enemy is not in object list', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    client.TeamManager.getEnemyQueue = () => [999]; // Enemy 999 is in queue
    const objectList = new ObjectList(client as any);
    const objects = [
      { shortcut: '1', desc: 'Goblin', num: 456 }, // But only enemy 456 is present
    ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();

    // Should not highlight 456 in gold since it's not the queued enemy
    const goblin = document.querySelector('.object-num[data-object-id="456"]') as HTMLElement;
    expect(goblin).toBeTruthy();
    expect(goblin.style.color).toBe('');
    expect(goblin.classList.contains('object-num-next-target')).toBe(false);

    // Should not have any gold highlighting
    const goldHighlighted = document.querySelector('.object-num-next-target');
    expect(goldHighlighted).toBeNull();
  });

  test('keeps an object\'s elements across renders', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    client.ObjectManager.getObjectsOnLocation = () => [{ shortcut: '1', desc: 'Ork', num: 7, hp: 5 }];
    (objectList as any).render();
    const before = document.querySelector('.object-num[data-object-id="7"]');
    client.ObjectManager.getObjectsOnLocation = () => [{ shortcut: '1', desc: 'Ork', num: 7, hp: 2 }];
    (objectList as any).render();
    const after = document.querySelector('.object-num[data-object-id="7"]');
    expect(after).toBe(before);
    expect(document.querySelector('.object-hp-bar')!.textContent).toBe('[###----]');
  });

  test('moves non-combat objects to the end with shortcuts starting at 50', async () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    class TestClient {
      private emitter = new EventEmitter();
      ObjectManager = new ObjectManager(this as any);
      TeamManager = { isInTeam: (_d: string) => false };
      sendCommand = jest.fn();
      on(event: string, cb: any) {
        this.emitter.on(event, cb);
        return () => this.off(event, cb);
      }
      off(event: string, cb: any) {
        this.emitter.off(event, cb);
      }
      emit(event: string, detail?: any) {
        this.emitter.emit(event, detail);
      }
      sendEvent(type: string, detail?: any) {
        this.emit(type, detail);
      }
    }
    const client = new TestClient();
    new ObjectList(client as any);
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Fighter', attack_num: true },
      '2': { desc: 'Rock' },
      '3': { desc: 'Tree' },
    });
    client.sendEvent('gmcp.objects.nums', ['1', '2', '3']);
    // Wait for scheduled render (uses queueMicrotask)
    await Promise.resolve();
    const html = (
      document.querySelector('#objects-list .objects-list-content') as HTMLElement
    ).innerHTML.split('<br>');
    expect(html[0]).toContain('data-object-num="1"');
    expect(html[1]).toContain('data-object-num="50"');
    expect(html[2]).toContain('data-object-num="51"');
  });
});
