import ObjectList from '../src/ObjectList';
import { getItemSync, setItemSync } from '@client/src/storage';

jest.mock('@client/src/storage', () => ({
  getItemSync: jest.fn(),
  setItemSync: jest.fn(),
}));

class MockClient {
  ObjectManager = { getObjectsOnLocation: () => [] as any[] };
  TeamManager = { isInTeam: () => false };
  addEventListener() {}
}

describe('ObjectList', () => {
  beforeEach(() => {
    (getItemSync as jest.Mock).mockReset();
    (setItemSync as jest.Mock).mockReset();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
  });

  test('non team members not fighting are not purple', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    const objects = [
      { shortcut: '1', desc: 'Goblin', state: 10 },
      { shortcut: '2', desc: 'Orc', state: 10, attack_num: true },
    ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();
    const html = (document.getElementById('objects-list') as HTMLElement).innerHTML.split('<br>');
    expect(html[0]).not.toContain('#b19cd9');
    expect(html[1]).toContain('#b19cd9');
  });

  test('converts stored right position to left', () => {
    (getItemSync as jest.Mock).mockReturnValue({ objectsListPosition: { x: 100, y: 50 } });
    Object.defineProperty(window, 'innerWidth', { value: 1000, writable: true });
    document.body.innerHTML = '<div id="objects-list"></div>';
    const container = document.getElementById('objects-list') as any;
    Object.defineProperty(container, 'offsetWidth', { value: 200, configurable: true });
    Object.defineProperty(container, 'offsetHeight', { value: 100, configurable: true });
    container.getBoundingClientRect = () => ({
      left: parseFloat(container.style.left || '0'),
      top: parseFloat(container.style.top || '0'),
      right: parseFloat(container.style.left || '0') + container.offsetWidth,
      bottom: parseFloat(container.style.top || '0') + container.offsetHeight,
      width: container.offsetWidth,
      height: container.offsetHeight,
    });
    const client = new MockClient();
    new ObjectList(client as any);
    expect(container.style.left).toBe('700px');
    expect(container.style.top).toBe('50px');
  });

  test('saves left position on pointer up', () => {
    (getItemSync as jest.Mock).mockReturnValue(undefined);
    document.body.innerHTML = '<div id="objects-list"></div>';
    const container = document.getElementById('objects-list') as any;
    Object.defineProperty(container, 'offsetWidth', { value: 200, configurable: true });
    Object.defineProperty(container, 'offsetHeight', { value: 100, configurable: true });
    container.getBoundingClientRect = () => ({
      left: 400,
      top: 60,
      right: 600,
      bottom: 160,
      width: 200,
      height: 100,
    });
    container.setPointerCapture = jest.fn();
    container.releasePointerCapture = jest.fn();
    const client = new MockClient();
    const ol: any = new ObjectList(client as any);
    const downEvent = { clientX: 0, clientY: 0, pointerId: 1, preventDefault: jest.fn() } as unknown as PointerEvent;
    ol.onPointerDown(downEvent);
    ol.onPointerUp({ pointerId: 1 } as unknown as PointerEvent);
    expect(setItemSync).toHaveBeenCalledWith('objectsListPosition', { left: 400, top: 60 });
  });
});
