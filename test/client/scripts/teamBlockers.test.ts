import Triggers from '@client/Triggers';
import initTeamBlockers from '@client/scripts/teamBlockers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  Map: { moveBack: jest.Mock; setBlockable: jest.Mock; isBlockable: boolean };
  Triggers: Triggers;

  constructor() {
    const self = this;
    this.Map = {
      moveBack: jest.fn(),
      setBlockable: jest.fn((value: boolean) => {
        self.Map.isBlockable = value;
      }),
      isBlockable: false,
    };
    this.Triggers = new Triggers(({} as unknown) as any);
  }
}

describe('team blockers', () => {
  let client: FakeClient;
  let parse: (line: string) => AnsiAwareBuffer | null;

  beforeEach(() => {
    client = new FakeClient();
    initTeamBlockers((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');
  });

  const blockerLine =
    'Probujesz sie ruszyc na polnoc, jednak pajecze sieci, w ktore sie w miedzyczasie zaplatales, uniemozliwiaja ci to.';

  test('does not move back when movement is not blockable', () => {
    client.Map.isBlockable = false;

    parse(blockerLine);

    expect(client.Map.moveBack).not.toHaveBeenCalled();
    expect(client.Map.setBlockable).not.toHaveBeenCalled();
  });

  test('moves back and clears blockable when blockable', () => {
    client.Map.isBlockable = true;

    parse(blockerLine);

    expect(client.Map.moveBack).toHaveBeenCalled();
    expect(client.Map.setBlockable).toHaveBeenCalledWith(false);
  });
});
