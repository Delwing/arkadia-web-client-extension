import Triggers from '../src/Triggers';
import initFollow from '../src/scripts/follow';

describe('follow triggers', () => {
  function createClient() {
    const client: any = {
      Map: {
        move: jest.fn(() => ({ moved: false })),
        followMove: jest.fn(),
        refreshPosition: true,
      },
      sendEvent: jest.fn(),
    };
    client.Triggers = new Triggers(client);
    return client;
  }

  function fireLine(client: any, line: string, type = 'game') {
    client.Triggers.triggers.forEach(trigger => {
      trigger.execute(line, type);
    });
  }

  it('refreshes position when idz command starts', () => {
    const client = createClient();
    initFollow(client);

    fireLine(client, "Wykonuje komende 'idz polnoc'");

    expect(client.sendEvent).toHaveBeenCalledWith('refreshPositionWhenAble');
  });

  it('follows reported direction after idz movement line', () => {
    const client = createClient();
    initFollow(client);

    fireLine(client, 'Ruszasz szybkim biegiem na polnoc.');

    expect(client.Map.followMove).toHaveBeenCalledWith('polnoc');
  });
});
