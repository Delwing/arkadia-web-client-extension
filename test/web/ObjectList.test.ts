import ObjectList from '@web/ObjectList';
import { globalStorage } from '@modules/core/storage';
import ObjectManager from '@client/ObjectManager';
import { EventEmitter } from 'events';

vi.mock('@modules/core/storage', () => {
  const listeners = new Map<string, Set<Function>>();
  const typedStorage = {
    get: jest.fn(),
    set: jest.fn(),
    onChange: jest.fn((key: string, listener: Function) => {
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(listener);
      return () => listeners.get(key)!.delete(listener);
    }),
    fireListeners: jest.fn(),
    handleStorageEvent: jest.fn(),
    getCharacter: jest.fn(() => null),
    setCharacter: jest.fn(),
  };
  return {
    __esModule: true,
    characterStorage: typedStorage,
    globalStorage: typedStorage,
  };
});

class MockClient {
  private emitter = new EventEmitter();
  ObjectManager = { getObjectsOnLocation: () => [] as any[] };
  TeamManager = { isInTeam: (_d: string) => false, getEnemyQueue: () => [] as number[], isLeader: () => false };
  on(event: string, handler: (...args: any[]) => void) {
    this.emitter.on(event, handler);
    return () => this.off(event, handler);
  }
  off(event: string, handler: (...args: any[]) => void) {
    this.emitter.off(event, handler);
  }
  emit(event: string, payload?: any) {
    this.emitter.emit(event, payload);
  }
  dispatch(event: string, payload: any) {
    this.emit(event, payload);
  }
  sendCommand = jest.fn();
  sendEvent = jest.fn();
}

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
    expect(content.innerHTML).toContain('Brak obiektow');
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
    const html = (
      document.querySelector('#objects-list .objects-list-content') as HTMLElement
    ).innerHTML.split('<br>');
    expect(html[0]).not.toContain('#b19cd9');
    expect(html[1]).toContain('#b19cd9');
  });

  test('converts stored right position to left', () => {
    (globalStorage.get as jest.Mock).mockImplementation((key: string) => {
      if (key === 'objectsListPosition') return { x: 100, y: 50 };
      return undefined;
    });
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
    (globalStorage.get as jest.Mock).mockReturnValue(undefined);
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
    expect(globalStorage.set).toHaveBeenCalledWith('objectsListPosition', { left: 400, top: 60 });
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
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_123');
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
    expect(highlighted.outerHTML).toContain('color:#ffd700');
    expect(highlighted.classList.contains('object-num-next-target')).toBe(true);
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
    expect(goblin.outerHTML).not.toContain('color:#ffd700');
    expect(goblin.classList.contains('object-num-next-target')).toBe(false);

    // Should not have any gold highlighting
    const goldHighlighted = document.querySelector('.object-num-next-target');
    expect(goldHighlighted).toBeNull();
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

  test('hides picture-in-picture control when unsupported', () => {
    document.body.innerHTML = '<div id="objects-list"></div>';
    const client = new MockClient();
    new ObjectList(client as any);
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
    (globalThis as any).documentPictureInPicture = { requestWindow };

    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    const container = document.getElementById('objects-list') as HTMLElement;
    expect(container.classList.contains('objects-list-pip-supported')).toBe(true);
    const button = document.getElementById('objects-list-pip-button') as HTMLButtonElement;
    expect(button).toBeTruthy();

    const objects = [ { shortcut: '1', desc: 'Orc', num: 123 } ];
    client.ObjectManager.getObjectsOnLocation = () => objects;
    (objectList as any).render();

    button.click();
    await Promise.resolve();
    expect(requestWindow).toHaveBeenCalled();
    expect(pipDoc.body.querySelector('#objects-list-pip')?.innerHTML).toContain('object-num');
    expect(button.classList.contains('objects-list-button-active')).toBe(true);
    expect(pipDoc.title).toBe('Arkadia');

    document.title = 'Arkadia - Battle';
    await Promise.resolve();
    await Promise.resolve();
    expect(pipDoc.title).toBe('Arkadia - Battle');

    handlers.pagehide?.call(pipWindow, undefined);
    expect(button.classList.contains('objects-list-button-active')).toBe(false);

    delete (globalThis as any).documentPictureInPicture;
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
    (globalThis as any).documentPictureInPicture = { requestWindow };

    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    const button = document.getElementById('objects-list-pip-button') as HTMLButtonElement;
    client.ObjectManager.getObjectsOnLocation = () => [
      { shortcut: '1', desc: 'Goblin', num: 7 },
    ];
    (objectList as any).render();

    button.click();
    await Promise.resolve();

    const pipNum = pipDoc.body.querySelector('.object-num[data-object-num="1"]') as HTMLElement;
    expect(pipNum).toBeTruthy();
    pipNum.click();
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_7');

    const pipDesc = pipDoc.body.querySelector('.object-desc[data-object-num="1"]') as HTMLElement;
    expect(pipDesc).toBeTruthy();
    pipDesc.click();
    expect(client.sendCommand).toHaveBeenCalledWith('/za 1');

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
    (objectList as any).onClick({ target: foreignTarget } as unknown as MouseEvent);
    expect(client.sendCommand).toHaveBeenCalledWith('/z 1');

    delete (globalThis as any).documentPictureInPicture;
  });

  test('picture-in-picture shows status header and footer', async () => {
    document.body.innerHTML = `
      <div id="location-text">#101 Northern Gate</div>
      <span id="cover-timer">Zas: 1.50</span>
      <div id="main_text_output_msg_wrapper">
        <div class="output_msg"><div class="output_msg_text"><span class="ansi">Enemies incoming</span></div></div>
        <div id="split-bottom"></div>
      </div>
      <div id="objects-list"></div>
    `;
    const pipDoc = document.implementation.createHTMLDocument('pip');
    const pipWindow = {
      document: pipDoc,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      close: jest.fn(),
    } as unknown as DocumentPictureInPictureWindow;
    const requestWindow = jest.fn().mockResolvedValue(pipWindow);
    (globalThis as any).documentPictureInPicture = { requestWindow };

    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    client.ObjectManager.getObjectsOnLocation = () => [
      { shortcut: '1', desc: 'Goblin', num: 7 },
    ];
    (objectList as any).render();

    const button = document.getElementById('objects-list-pip-button') as HTMLButtonElement;
    button.click();
    await Promise.resolve();

    const pipRoot = pipDoc.body.querySelector('#objects-list-pip') as HTMLElement;
    expect(pipRoot).toBeTruthy();
    const getHeaderHtml = () =>
      (pipRoot.querySelector('.objects-list-pip-header') as HTMLElement | null)?.innerHTML || '';
    const getFooterHtml = () =>
      (pipRoot.querySelector('.objects-list-pip-footer-content') as HTMLElement | null)?.innerHTML || '';
    const getBodyHtml = () =>
      (pipRoot.querySelector('.objects-list-pip-body') as HTMLElement | null)?.innerHTML || '';

    expect(getHeaderHtml()).toContain('#101 Northern Gate');
    expect(getHeaderHtml()).toContain('Zas: 1.50');
    expect(getBodyHtml()).toContain('Goblin');
    const initialFooterHtml = getFooterHtml();
    expect(initialFooterHtml).toContain('Enemies incoming');
    expect(initialFooterHtml).toContain('span class="ansi"');

    const locationEl = document.getElementById('location-text')!;
    locationEl.textContent = '#202 Southern Gate';
    await Promise.resolve();
    expect(getHeaderHtml()).toContain('#202 Southern Gate');

    const coverEl = document.getElementById('cover-timer')!;
    coverEl.textContent = 'Zas: OK';
    await Promise.resolve();
    expect(getHeaderHtml()).toContain('Zas: OK');

    const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
    const msg = document.createElement('div');
    msg.className = 'output_msg';
    const msgText = document.createElement('div');
    msgText.className = 'output_msg_text';
    msgText.innerHTML = '<span class="ansi">All clear</span>';
    msg.appendChild(msgText);
    wrapper.insertBefore(msg, document.getElementById('split-bottom'));
    (objectList as any).handleOutputUpdate();
    const footerHtml = getFooterHtml();
    expect(footerHtml).toContain('Enemies incoming');
    expect(footerHtml).toContain('All clear');
    expect(footerHtml.split('<br>').length).toBe(2);

    delete (globalThis as any).documentPictureInPicture;
  });

  test('picture-in-picture footer shows last two lines of multiline message', async () => {
    document.body.innerHTML = `
      <div id="location-text"></div>
      <span id="cover-timer"></span>
      <div id="main_text_output_msg_wrapper">
        <div class="output_msg"><div class="output_msg_text">Initial</div></div>
        <div id="split-bottom"></div>
      </div>
      <div id="objects-list"></div>
    `;
    const pipDoc = document.implementation.createHTMLDocument('pip');
    const pipWindow = {
      document: pipDoc,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      close: jest.fn(),
    } as unknown as DocumentPictureInPictureWindow;
    const requestWindow = jest.fn().mockResolvedValue(pipWindow);
    (globalThis as any).documentPictureInPicture = { requestWindow };

    const client = new MockClient();
    const objectList = new ObjectList(client as any);
    (objectList as any).render();
    (objectList as any).handleOutputUpdate();

    const button = document.getElementById('objects-list-pip-button') as HTMLButtonElement;
    button.click();
    await Promise.resolve();

    const wrapper = document.getElementById('main_text_output_msg_wrapper')!;
    const msg = document.createElement('div');
    msg.className = 'output_msg';
    const msgText = document.createElement('div');
    msgText.className = 'output_msg_text';
    msgText.innerHTML = '<span class="ansi">First line</span><br><span class="ansi">Second line</span>\n<span class="ansi">Third line</span>';
    msg.appendChild(msgText);
    wrapper.insertBefore(msg, document.getElementById('split-bottom'));
    (objectList as any).handleOutputUpdate();

    const footerHtml = (
      pipDoc.body.querySelector('.objects-list-pip-footer-content') as HTMLElement | null
    )?.innerHTML || '';
    expect(footerHtml).not.toContain('First line');
    expect(footerHtml).toContain('Second line');
    expect(footerHtml).toContain('Third line');
    expect(footerHtml.split('<br>').length).toBe(2);

    delete (globalThis as any).documentPictureInPicture;
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
    (globalThis as any).documentPictureInPicture = { requestWindow };

    const client = new MockClient();
    new ObjectList(client as any);
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

    delete (globalThis as any).documentPictureInPicture;
  });
});
