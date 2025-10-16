import initCommandPreserveCaseMode from '../src/scripts/commandPreserveCaseMode';

describe('command preserve case mode', () => {
  class FakeClient extends EventTarget {
    Triggers = {
      registerTrigger: jest.fn((pattern: any, callback: any) => {
        this.registeredTriggers.push({ pattern, callback });
        return {};
      }),
    };
    registeredTriggers: { pattern: any; callback: any }[] = [];
    setCommandPreserveCaseMode = jest.fn();
  }

  let client: FakeClient;

  beforeEach(() => {
    client = new FakeClient();
    initCommandPreserveCaseMode((client as unknown) as any);
  });

  test('enters mode on napisz command', () => {
    client.dispatchEvent(new CustomEvent('command', { detail: 'napisz list' }));
    expect(client.setCommandPreserveCaseMode).toHaveBeenCalledWith(true);
  });

  test('enters and exits mode based on gmcp editing flag', () => {
    client.dispatchEvent(new CustomEvent('gmcp.char.info', { detail: { object_num: 3 } }));
    client.dispatchEvent(new CustomEvent('gmcp.object.data', { detail: { 3: { editing: true } } }));
    expect(client.setCommandPreserveCaseMode).toHaveBeenCalledWith(true);

    client.setCommandPreserveCaseMode.mockClear();
    client.dispatchEvent(new CustomEvent('gmcp.object.data', { detail: { 3: { editing: false } } }));
    expect(client.setCommandPreserveCaseMode).toHaveBeenCalledWith(false);
  });

  test('ignores gmcp updates without editing flag', () => {
    client.dispatchEvent(new CustomEvent('gmcp.char.info', { detail: { object_num: 4 } }));
    client.dispatchEvent(new CustomEvent('gmcp.object.data', { detail: { 4: {} } }));
    expect(client.setCommandPreserveCaseMode).not.toHaveBeenCalled();
  });

  test('does not exit mode when editing flag is false without prior activation', () => {
    client.dispatchEvent(new CustomEvent('gmcp.char.info', { detail: { object_num: 5 } }));
    client.dispatchEvent(new CustomEvent('gmcp.object.data', { detail: { 5: { editing: false } } }));
    expect(client.setCommandPreserveCaseMode).not.toHaveBeenCalled();
  });
  
});
