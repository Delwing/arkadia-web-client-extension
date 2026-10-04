import { FunctionalBind, FunctionalBindManager } from '@client/scripts/functionalBind';

describe('FunctionalBind clickable text', () => {
  test('set makes printed text clickable', () => {
    const client = {
      on: jest.fn(),
      println: jest.fn(),
    } as any;

    const fb = new FunctionalBind(client);
    const cb = jest.fn();
    fb.set('cmd', cb);

    // Check that println was called
    expect(client.println).toHaveBeenCalled();

    // Get the printed buffer
    const printedBuffer = client.println.mock.calls[0][0];

    // Check it's an AnsiAwareBuffer with the expected text
    expect(printedBuffer.text).toContain('bind');
    expect(printedBuffer.text).toContain(']');
    expect(printedBuffer.text).toContain('cmd');
  });

  test('set updates callback when called again with same text', () => {
    const client = {
      on: jest.fn(),
      println: jest.fn(),
    } as any;

    const fb = new FunctionalBind(client);
    const cb1 = jest.fn();
    fb.set('cmd', cb1);

    const cb2 = jest.fn();
    fb.set('cmd', cb2);

    // Only one println call should be made since the printable text is the same
    expect(client.println).toHaveBeenCalledTimes(1);
  });
});

describe('FunctionalBindManager clearCategory', () => {
  function createMockClient() {
    return {
      on: jest.fn(),
      println: jest.fn(),
      sendCommand: jest.fn(),
    } as any;
  }

  function pressBind() {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketRight', key: ']', bubbles: true }));
  }

  test('clearing a category does not bring back an earlier one on the same key', () => {
    const client = createMockClient();
    const manager = new FunctionalBindManager(client);

    const defaultCb = jest.fn();
    const gatesCb = jest.fn();

    manager.setCategory('default', 'usiadz', defaultCb);
    manager.setCategory('gates', 'uderz we wrota', gatesCb);

    manager.clearCategory('gates');
    pressBind();

    expect(defaultCb).not.toHaveBeenCalled();
    expect(gatesCb).not.toHaveBeenCalled();
    expect(manager.getCategory('default')?.isActive()).toBe(false);
  });

  // Regression: a plugin bind cleared after use let a gate knock from rooms back fire
  // under the plugin's bind line.
  test('a bind cleared after use does not bring back an earlier one', () => {
    const manager = new FunctionalBindManager(createMockClient());

    const gatesCb = jest.fn();
    const pluginCb = jest.fn();

    manager.setCategory('gates', 'uderz we wrota', gatesCb);
    manager.set('ob czarne plytki', pluginCb, true);

    pressBind();
    pressBind();

    expect(pluginCb).toHaveBeenCalledTimes(1);
    expect(gatesCb).not.toHaveBeenCalled();
  });

  test('clearing an older bind leaves the newer one alone', () => {
    const manager = new FunctionalBindManager(createMockClient());

    const gatesCb = jest.fn();
    const defaultCb = jest.fn();

    manager.setCategory('gates', 'uderz we wrota', gatesCb);
    manager.setCategory('default', 'usiadz', defaultCb);
    manager.clearCategory('gates');

    pressBind();

    expect(defaultCb).toHaveBeenCalled();
  });

  test('binds on a different key survive', () => {
    const manager = new FunctionalBindManager(createMockClient());

    manager.updateOptions({ key: 'KeyG', ctrl: true }, 'gates');
    manager.setCategory('gates', 'uderz we wrota', jest.fn());
    manager.setCategory('default', 'usiadz', jest.fn());
    manager.clearCategory('default');

    expect(manager.getCategory('gates')?.isActive()).toBe(true);
  });

  test('clearCategory resets setOrder so a re-set category can win again', () => {
    const client = createMockClient();
    const manager = new FunctionalBindManager(client);

    const defaultCb = jest.fn();
    const gatesCb = jest.fn();

    manager.setCategory('default', 'usiadz', defaultCb);
    manager.setCategory('gates', 'uderz we wrota', gatesCb);
    manager.clearCategory('gates');

    // Re-set gates — it should win again since it's the most recently set.
    const gatesCb2 = jest.fn();
    manager.setCategory('gates', 'uderz we wrota', gatesCb2);

    const event = new KeyboardEvent('keydown', { code: 'BracketRight', key: ']', bubbles: true });
    window.dispatchEvent(event);

    expect(gatesCb2).toHaveBeenCalled();
    expect(defaultCb).not.toHaveBeenCalled();
  });
});

describe('FunctionalBindManager re-set priority', () => {
  function createMockClient() {
    return {
      on: jest.fn(),
      println: jest.fn(),
      sendCommand: jest.fn(),
    } as any;
  }

  function pressBind() {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'BracketRight', key: ']', bubbles: true }));
  }

  // Regression: a gate that stays shut re-arms the same "uderz w brame" bind, which
  // must take the key back from an enemy bind set in between.
  test('re-setting the same command takes the key back from a newer bind', () => {
    const manager = new FunctionalBindManager(createMockClient());

    const gateCb = jest.fn();
    const enemyCb = jest.fn();

    manager.setCategory('gates', 'uderz w brame', gateCb);
    manager.setCategory('default', 'chzabij <niski zabandazowany mutant>', enemyCb);
    manager.setCategory('gates', 'uderz w brame', gateCb);

    pressBind();

    expect(gateCb).toHaveBeenCalled();
    expect(enemyCb).not.toHaveBeenCalled();
  });

  test('a changed command still takes over the key', () => {
    const manager = new FunctionalBindManager(createMockClient());

    const lootCb = jest.fn();
    const followCb = jest.fn();

    manager.setCategory('default', 'wejdz do komina', followCb);
    manager.setCategory('loot', 'wez z ziemi', lootCb);
    manager.setCategory('loot', 'wez z ciala', lootCb);

    pressBind();

    expect(lootCb).toHaveBeenCalled();
    expect(followCb).not.toHaveBeenCalled();
  });
});
