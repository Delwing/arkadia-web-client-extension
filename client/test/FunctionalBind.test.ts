import { FunctionalBind } from '../src/scripts/functionalBind';
import { color } from '../src/Colors';

describe('FunctionalBind clickable text', () => {
  test('set makes printed text clickable', () => {
    const client = {
      addEventListener: jest.fn(),
      println: jest.fn(),
      createButton: jest.fn(() => ({ remove: jest.fn() })),
      OutputHandler: { makeClickable: jest.fn(() => 'clickable') },
    } as any;

    const fb = new FunctionalBind(client);
    const cb = jest.fn();
    fb.set('cmd', cb);

    const expectedLine = `\t${color(49)}bind ${color(222)}]${color(49)}: cmd`;
    expect(client.OutputHandler.makeClickable).toHaveBeenCalledWith(expectedLine, 'cmd', expect.any(Function));
    expect(client.println).toHaveBeenCalledWith('clickable');
  });

  test('set updates button callback when called again with same text', () => {
    const button: any = { remove: jest.fn(), onclick: () => {} };
    const client = {
      addEventListener: jest.fn(),
      println: jest.fn(),
      createButton: jest.fn(() => button),
      OutputHandler: { makeClickable: jest.fn(() => 'clickable') },
    } as any;

    const fb = new FunctionalBind(client);
    const cb1 = jest.fn();
    fb.set('cmd', cb1);

    const cb2 = jest.fn();
    fb.set('cmd', cb2);

    // clicking the button should invoke the latest callback
    button.onclick();
    expect(cb2).toHaveBeenCalled();
  });
});
