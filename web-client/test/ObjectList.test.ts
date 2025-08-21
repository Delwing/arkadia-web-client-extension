import ObjectList from '../src/ObjectList';

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
});
