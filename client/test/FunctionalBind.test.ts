import { FunctionalBind } from '../src/scripts/functionalBind';
import { color } from '../src/Colors';

describe('FunctionalBind clickable text', () => {
  test('set makes printed text clickable', () => {
    const client = {
      addEventListener: jest.fn(),
      println: jest.fn(),
      OutputHandler: { makeClickable: jest.fn(() => 'clickable') },
    } as any;

    const fb = new FunctionalBind(client);
    const cb = jest.fn();
    fb.set('cmd', cb);

    const expectedLine = `\t${color(49)}bind ${color(222)}]${color(49)}: cmd`;
    expect(client.OutputHandler.makeClickable).toHaveBeenCalledWith(expectedLine, 'cmd', expect.any(Function));
    expect(client.println).toHaveBeenCalledWith('clickable');
  });
});
