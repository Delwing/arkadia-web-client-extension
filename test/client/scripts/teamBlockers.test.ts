import Triggers from '@client/Triggers';
import initTeamBlockers from '@client/scripts/teamBlockers';

class FakeClient {
  Map: { moveBack: jest.Mock; setBlockable: jest.Mock; isBlockable: boolean };
  TeamManager: { isInAnyTeam: jest.Mock; isLeader: jest.Mock };
  Triggers: Triggers;

  constructor() {
    this.TeamManager = {
      isInAnyTeam: jest.fn(() => false),
      isLeader: jest.fn(() => false),
    };
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
  let parse: (line: string) => string;

  beforeEach(() => {
    client = new FakeClient();
    initTeamBlockers((client as unknown) as any);
    parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, line, '');
  });

  const blockerLine =
    'Probujesz sie ruszyc na polnoc, jednak pajecze sieci, w ktore sie w miedzyczasie zaplatales, uniemozliwiaja ci to.';

  test('does not move back when player is not in team', () => {
    client.Map.isBlockable = true;
    client.TeamManager.isInAnyTeam.mockReturnValue(false);

    parse(blockerLine);

    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('does not move back when player is team leader', () => {
    client.Map.isBlockable = true;
    client.TeamManager.isInAnyTeam.mockReturnValue(true);
    client.TeamManager.isLeader.mockReturnValue(true);

    parse(blockerLine);

    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('does not move back when movement is not blockable', () => {
    client.TeamManager.isInAnyTeam.mockReturnValue(true);
    client.TeamManager.isLeader.mockReturnValue(false);
    client.Map.isBlockable = false;

    parse(blockerLine);

    expect(client.Map.moveBack).not.toHaveBeenCalled();
  });

  test('moves back when in team, not leader and blockable', () => {
    client.TeamManager.isInAnyTeam.mockReturnValue(true);
    client.TeamManager.isLeader.mockReturnValue(false);
    client.Map.isBlockable = true;

    parse(blockerLine);

    expect(client.Map.moveBack).toHaveBeenCalled();
    expect(client.Map.setBlockable).toHaveBeenCalledWith(false);
  });
});
