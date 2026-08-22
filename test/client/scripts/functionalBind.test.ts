import { FunctionalBind, FunctionalBindManager } from '@client/functionalBind';

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

  test('clearing a category lets earlier category surface on key press', () => {
    const client = createMockClient();
    const manager = new FunctionalBindManager(client);

    const defaultCb = jest.fn();
    const gatesCb = jest.fn();

    // Set default first, then gates — gates wins by recency.
    manager.setCategory('default', 'usiadz', defaultCb);
    manager.setCategory('gates', 'uderz we wrota', gatesCb);

    // Clear gates — default should surface.
    manager.clearCategory('gates');

    // Simulate keydown matching BracketRight (default bind key).
    const event = new KeyboardEvent('keydown', { code: 'BracketRight', key: ']', bubbles: true });
    window.dispatchEvent(event);

    expect(defaultCb).toHaveBeenCalled();
    expect(gatesCb).not.toHaveBeenCalled();
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
