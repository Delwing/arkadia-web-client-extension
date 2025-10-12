import ObjectList from '../src/ObjectList';
import { getItemSync, setItemSync } from '@client/src/storage';
import type { NearbyObject } from '../src/ui/store';
import { uiStore, resetUiStoreForTesting } from '../src/ui/store';
import type { CommandDispatcher } from '@client/src/runtime/command-dispatcher';

jest.mock('@client/src/storage', () => ({
  getItemSync: jest.fn(),
  setItemSync: jest.fn(),
}));

function setNearbyObjects(objects: NearbyObject[]) {
  uiStore.setState({ nearbyObjects: objects });
}

function setAttackQueue(queue: string[]) {
  uiStore.setState({ attackQueue: queue });
}

function createDispatcher(): CommandDispatcher {
  return {
    sendCommand: jest.fn(),
    sendEvent: jest.fn(),
    sendExtensionCommand: jest.fn().mockReturnValue(false),
  };
}

describe('ObjectList', () => {
  let dispatcher: CommandDispatcher;

  beforeEach(() => {
    resetUiStoreForTesting();
    dispatcher = createDispatcher();
    uiStore.getState().setCommandDispatcher(dispatcher);
    (getItemSync as jest.Mock).mockReset();
    (setItemSync as jest.Mock).mockReset();
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
  });

  test('non team members not fighting are not purple', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    new ObjectList();
    const objects: NearbyObject[] = [
      { id: '1', num: 1, shortcut: '1', desc: 'Goblin', state: 10 } as NearbyObject,
      { id: '2', num: 2, shortcut: '2', desc: 'Orc', state: 10, attackNum: true } as NearbyObject,
    ];
    setNearbyObjects(objects);
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
    new ObjectList();
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
    const ol: any = new ObjectList();
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
    const ol: any = new ObjectList();
    const objects: NearbyObject[] = [
      { id: '1', num: 1, shortcut: '1', desc: 'Goblin' } as NearbyObject,
    ];
    setNearbyObjects(objects);
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
    new ObjectList();
    const objects: NearbyObject[] = [
      { id: '123', num: 123, shortcut: '1', desc: 'Orc' } as NearbyObject,
    ];
    setNearbyObjects(objects);
    const num = document.querySelector('.object-num[data-object-num="1"]') as HTMLElement;
    num.click();
    expect(dispatcher.sendCommand).toHaveBeenCalledWith('/z 1', undefined);
  });

  test('clicking teammate shields them', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    new ObjectList();
    const objects: NearbyObject[] = [
      { id: '42', num: 42, shortcut: '1', desc: 'Ally', team: true } as NearbyObject,
    ];
    setNearbyObjects(objects);
    const desc = document.querySelector('.object-desc[data-object-num="1"]') as HTMLElement;
    desc.click();
    expect(dispatcher.sendCommand).toHaveBeenCalledWith('/za 1', undefined);
  });

  test('clicking enemy shields against them', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    new ObjectList();
    const objects: NearbyObject[] = [
      { id: '77', num: 77, shortcut: '1', desc: 'Goblin' } as NearbyObject,
    ];
    setNearbyObjects(objects);
    const desc = document.querySelector('.object-desc[data-object-num="1"]') as HTMLElement;
    desc.click();
    expect(dispatcher.sendCommand).toHaveBeenCalledWith('/za 1', undefined);
  });

  test('highlights next queued enemy number in gold', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    new ObjectList();
    const objects: NearbyObject[] = [
      { id: '123', num: 123, shortcut: '1', desc: 'Ork' } as NearbyObject,
      { id: '456', num: 456, shortcut: '2', desc: 'Goblin' } as NearbyObject,
    ];
    setNearbyObjects(objects);
    setAttackQueue(['123']);
    const highlighted = document.querySelector(
      '.object-num[data-object-id="123"]',
    ) as HTMLElement;
    expect(highlighted).toBeTruthy();
    expect(highlighted.outerHTML).toContain('color:#ffd700');
    expect(highlighted.classList.contains('object-num-next-target')).toBe(true);
  });

  test('player object is not clickable', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    new ObjectList();
    const objects: NearbyObject[] = [
      { id: '99', num: 99, shortcut: '@', desc: 'Hero' } as NearbyObject,
    ];
    setNearbyObjects(objects);
    expect(document.querySelector('.object-num[data-object-id="99"]')).toBeNull();
    expect(document.querySelector('.object-desc[data-object-id="99"]')).toBeNull();
    const content = document.querySelector('#objects-list .objects-list-content') as HTMLElement;
    content.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dispatcher.sendCommand).not.toHaveBeenCalled();
  });

  test('moves non-combat objects to the end with shortcuts starting at 50', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    new ObjectList();
    const objects: NearbyObject[] = [
      { id: '1', num: 1, shortcut: '1', desc: 'Fighter', attackNum: 1 } as NearbyObject,
      { id: '2', num: 2, shortcut: '50', desc: 'Rock' } as NearbyObject,
      { id: '3', num: 3, shortcut: '51', desc: 'Tree' } as NearbyObject,
    ];
    setNearbyObjects(objects);
    const html = (
      document.querySelector('#objects-list .objects-list-content') as HTMLElement
    ).innerHTML.split('<br>');
    expect(html[0]).toContain('data-object-num="1"');
    expect(html[1]).toContain('data-object-num="50"');
    expect(html[2]).toContain('data-object-num="51"');
  });

  test('hides picture-in-picture control when unsupported', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    new ObjectList();
    expect(document.getElementById('objects-list-pip-button')).toBeNull();
    const container = document.getElementById('objects-list') as HTMLElement;
    expect(container.classList.contains('objects-list-pip-supported')).toBe(false);
  });

  test('opens picture-in-picture window when supported', async () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    document.title = 'Arkadia';
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

    new ObjectList();
    const container = document.getElementById('objects-list') as HTMLElement;
    expect(container.classList.contains('objects-list-pip-supported')).toBe(true);
    const button = document.getElementById('objects-list-pip-button') as HTMLButtonElement;
    expect(button).toBeTruthy();

    const objects: NearbyObject[] = [
      { id: '123', num: 123, shortcut: '1', desc: 'Orc' } as NearbyObject,
    ];
    setNearbyObjects(objects);

    button.click();
    await Promise.resolve();
    expect(requestWindow).toHaveBeenCalled();
    expect(pipDoc.body.querySelector('#objects-list-pip')?.innerHTML).toContain('object-num');
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(pipDoc.title).toBe('Arkadia');

    document.title = 'Arkadia - Battle';
    await Promise.resolve();
    await Promise.resolve();
    expect(pipDoc.title).toBe('Arkadia - Battle');

    handlers.pagehide?.call(pipWindow, undefined);
    expect(button.getAttribute('aria-pressed')).toBe('false');

    delete (window as any).documentPictureInPicture;
  });

  test('picture-in-picture entries remain clickable', async () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const pipDoc = document.implementation.createHTMLDocument('pip');
    const pipWindow = {
      document: pipDoc,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      close: jest.fn(),
    } as unknown as DocumentPictureInPictureWindow;
    const requestWindow = jest.fn().mockResolvedValue(pipWindow);
    (window as any).documentPictureInPicture = { requestWindow };

    const objectList: any = new ObjectList();
    const button = document.getElementById('objects-list-pip-button') as HTMLButtonElement;
    const objects: NearbyObject[] = [
      { id: '7', num: 7, shortcut: '1', desc: 'Goblin' } as NearbyObject,
    ];
    setNearbyObjects(objects);

    button.click();
    await Promise.resolve();

    const pipNum = pipDoc.body.querySelector('.object-num[data-object-num="1"]') as HTMLElement;
    expect(pipNum).toBeTruthy();
    pipNum.click();
    expect(dispatcher.sendCommand).toHaveBeenCalledWith('/z 1', undefined);

    const pipDesc = pipDoc.body.querySelector('.object-desc[data-object-num="1"]') as HTMLElement;
    expect(pipDesc).toBeTruthy();
    pipDesc.click();
    expect(dispatcher.sendCommand).toHaveBeenCalledWith('/za 1', undefined);

    const foreignTarget = {
      nodeType: Node.ELEMENT_NODE,
      closest: (selector: string) => {
        if (selector === '.objects-list-controls') {
          return null;
        }
        if (selector === '.object-num[data-object-num]') {
          return foreignTarget;
        }
        if (selector === '.object-desc[data-object-num]') {
          return null;
        }
        return null;
      },
      getAttribute: (name: string) => {
        if (name === 'data-object-num') {
          return '1';
        }
        return null;
      },
    } as unknown as HTMLElement;
    objectList.onClick({ target: foreignTarget } as unknown as MouseEvent);
    expect(dispatcher.sendCommand).toHaveBeenCalledWith('/z 1', undefined);

    delete (window as any).documentPictureInPicture;
  });

  test('picture-in-picture inherits objects list styling changes', async () => {
    document.body.innerHTML = '<div id="objects-list" style="font-size: 0.9rem; font-family: Courier, monospace;"></div>';
    const container = document.getElementById('objects-list') as HTMLElement;
    const pipDoc = document.implementation.createHTMLDocument('pip');
    const pipWindow = {
      document: pipDoc,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      close: jest.fn(),
    } as unknown as DocumentPictureInPictureWindow;
    const requestWindow = jest.fn().mockResolvedValue(pipWindow);
    (window as any).documentPictureInPicture = { requestWindow };

    new ObjectList();
    const button = document.getElementById('objects-list-pip-button') as HTMLButtonElement;
    button.click();
    await Promise.resolve();

    expect(pipDoc.body.style.fontSize).toBe('0.9rem');
    expect(pipDoc.body.style.fontFamily).toContain('Courier');
    expect(pipDoc.body.style.border).toBe('');

    container.style.fontSize = '1.5rem';
    container.style.fontFamily = 'serif';
    await Promise.resolve();
    await Promise.resolve();

    expect(pipDoc.body.style.fontSize).toBe('1.5rem');
    expect(pipDoc.body.style.fontFamily).toContain('serif');

    delete (window as any).documentPictureInPicture;
  });
});
