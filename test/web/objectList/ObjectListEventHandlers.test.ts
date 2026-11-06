import ObjectList from '@web/objectList/ObjectList';
import { MockClient } from './support';

vi.mock('@modules/core/storage', async () => (await import('./support')).storageMockModule());

// The handlers are wired by the ObjectList shell; these click its rendered rows.
describe('ObjectListEventHandlers', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="objects-list"></div>';
  });

  function renderWith(client: MockClient, objects: any[]) {
    const objectList: any = new ObjectList(client as any);
    client.ObjectManager.getObjectsOnLocation = () => objects;
    objectList.render();
    return objectList;
  }

  test('clicking number attacks that target', () => {
    const client = new MockClient();
    renderWith(client, [ { shortcut: '1', desc: 'Orc', num: 123 } ]);
    const num = document.querySelector('.object-num[data-object-num="1"]') as HTMLElement;
    num.click();
    expect(client.sendCommand).toHaveBeenCalledWith('zabij ob_123');
  });

  test('clicking teammate shields them', () => {
    const client = new MockClient();
    client.TeamManager.isInTeam = (d: string) => d === 'Ally';
    renderWith(client, [ { shortcut: '1', desc: 'Ally', num: 42 } ]);
    const desc = document.querySelector('.object-desc[data-object-num="1"]') as HTMLElement;
    desc.click();
    expect(client.sendCommand).toHaveBeenCalledWith('/za 1');
  });

  test('clicking enemy shields against them', () => {
    const client = new MockClient();
    renderWith(client, [ { shortcut: '1', desc: 'Goblin', num: 77 } ]);
    const desc = document.querySelector('.object-desc[data-object-num="1"]') as HTMLElement;
    desc.click();
    expect(client.sendCommand).toHaveBeenCalledWith('/za 1');
  });

  test('player object is not clickable', () => {
    const client = new MockClient();
    renderWith(client, [ { shortcut: '@', desc: 'Hero', num: 99 } ]);
    expect(document.querySelector('.object-num[data-object-id="99"]')).toBeNull();
    expect(document.querySelector('.object-desc[data-object-id="99"]')).toBeNull();
    const content = document.querySelector('#objects-list .objects-list-content') as HTMLElement;
    content.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(client.sendCommand).not.toHaveBeenCalled();
  });

  test('accepts a target element from another document realm', () => {
    const client = new MockClient();
    const objectList = renderWith(client, [ { shortcut: '1', desc: 'Goblin', num: 7 } ]);
    const foreignTarget = {
      nodeType: Node.ELEMENT_NODE,
      closest: (selector: string) => {
        if (selector === '.object-num[data-object-num]') {
          return foreignTarget;
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
    objectList.handlers.onClick({ target: foreignTarget } as unknown as MouseEvent);
    expect(client.sendCommand).toHaveBeenCalledWith('/z 1');
  });
});
