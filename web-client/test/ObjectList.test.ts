import ObjectList from '../src/ObjectList';
import { getItemSync, setItemSync } from '@client/src/storage';
import ObjectManager from '@client/src/ObjectManager';
import { EventEmitter } from 'events';

jest.mock('@client/src/storage', () => ({
  getItemSync: jest.fn(),
  setItemSync: jest.fn(),
}));

class MockClient {
  ObjectManager = { getObjectsOnLocation: () => [] as any[] };
  TeamManager = { isInTeam: (_d: string) => false };
  addEventListener() {}
  sendCommand = jest.fn();
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
    const html = (
      document.querySelector('#objects-list .objects-list-content') as HTMLElement
    ).innerHTML.split('<br>');
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
    const downEvent = {
      clientX: 0,
      clientY: 0,
      pointerId: 1,
      preventDefault: jest.fn(),
      target: container,
    } as unknown as PointerEvent;
    ol.onPointerDown(downEvent);
    ol.onPointerUp({ pointerId: 1 } as unknown as PointerEvent);
    expect(setItemSync).toHaveBeenCalledWith('objectsListPosition', { left: 400, top: 60 });
  });

  test('pointer down on object item does not start drag', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const container = document.getElementById('objects-list') as any;
    container.setPointerCapture = jest.fn();
    const client = new MockClient();
    const ol: any = new ObjectList(client as any);
    const objects = [{ shortcut: '1', desc: 'Goblin', num: 1 }];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (ol as any).render();
    const num = document.querySelector('.object-num') as HTMLElement;
    const downEventNum = {
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      target: num,
      preventDefault: jest.fn(),
    } as unknown as PointerEvent;
    ol.onPointerDown(downEventNum);
    expect((ol as any).isDragging).toBeFalsy();
    expect(container.setPointerCapture).not.toHaveBeenCalled();
    const desc = document.querySelector('.object-desc') as HTMLElement;
    const downEventDesc = {
      pointerId: 2,
      clientX: 0,
      clientY: 0,
      target: desc,
      preventDefault: jest.fn(),
    } as unknown as PointerEvent;
    ol.onPointerDown(downEventDesc);
    expect((ol as any).isDragging).toBeFalsy();
  });

  test('clicking number attacks that target', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    const objects = [ { shortcut: '1', desc: 'Orc', num: 123 } ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();
    const num = document.querySelector('.object-num[data-object-num="1"]') as HTMLElement;
    num.click();
    expect(client.sendCommand).toHaveBeenCalledWith('/z 1');
  });

  test('clicking teammate shields them', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    client.TeamManager.isInTeam = (d: string) => d === 'Ally';
    const objectList = new ObjectList(client as any);
    const objects = [ { shortcut: '1', desc: 'Ally', num: 42 } ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();
    const desc = document.querySelector('.object-desc[data-object-num="1"]') as HTMLElement;
    desc.click();
    expect(client.sendCommand).toHaveBeenCalledWith('/za 1');
  });

  test('clicking enemy shields against them', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    const objects = [ { shortcut: '1', desc: 'Goblin', num: 77 } ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();
    const desc = document.querySelector('.object-desc[data-object-num="1"]') as HTMLElement;
    desc.click();
    expect(client.sendCommand).toHaveBeenCalledWith('/za 1');
  });

  test('player object is not clickable', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    const objects = [ { shortcut: '@', desc: 'Hero', num: 99 } ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();
    expect(document.querySelector('.object-num[data-object-id="99"]')).toBeNull();
    expect(document.querySelector('.object-desc[data-object-id="99"]')).toBeNull();
    const content = document.querySelector('#objects-list .objects-list-content') as HTMLElement;
    content.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(client.sendCommand).not.toHaveBeenCalled();
  });

  test('moves non-combat objects to the end with shortcuts starting at 50', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    class TestClient {
      private emitter = new EventEmitter();
      ObjectManager = new ObjectManager(this as any);
      TeamManager = { isInTeam: (_d: string) => false };
      sendCommand = jest.fn();
      addEventListener(event: string, cb: any) {
        this.emitter.on(event, cb);
      }
      sendEvent(type: string, detail?: any) {
        this.emitter.emit(type, { detail });
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
    const html = (
      document.querySelector('#objects-list .objects-list-content') as HTMLElement
    ).innerHTML.split('<br>');
    expect(html[0]).toContain('data-object-num="1"');
    expect(html[1]).toContain('data-object-num="50"');
    expect(html[2]).toContain('data-object-num="51"');
  });

  test('opens picture-in-picture window when supported', async () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const pipDoc = document.implementation.createHTMLDocument('pip');
    const handlers: Record<string, (ev?: any) => void> = {};
    const pipWindow = {
      document: pipDoc,
      addEventListener: jest.fn((type: string, handler: (ev?: any) => void) => {
        handlers[type] = handler;
      }),
      removeEventListener: jest.fn((type: string) => {
        delete handlers[type];
      }),
      close: jest.fn(),
    } as unknown as DocumentPictureInPictureWindow;
    const requestWindow = jest.fn().mockResolvedValue(pipWindow);
    (window as any).documentPictureInPicture = { requestWindow };

    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    const button = document.getElementById('objects-list-pip-button') as HTMLButtonElement;
    expect(button).toBeTruthy();

    const objects = [ { shortcut: '1', desc: 'Orc', num: 123 } ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();

    button.click();
    await Promise.resolve();
    expect(requestWindow).toHaveBeenCalled();
    expect(pipDoc.body.querySelector('#objects-list-pip')?.innerHTML).toContain('object-num');
    expect(button.getAttribute('aria-pressed')).toBe('true');

    handlers.pagehide?.call(pipWindow, undefined);
    expect(button.getAttribute('aria-pressed')).toBe('false');

    delete (window as any).documentPictureInPicture;
  });
});
