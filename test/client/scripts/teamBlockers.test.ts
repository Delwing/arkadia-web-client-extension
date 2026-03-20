import Triggers from '@client/Triggers';
import initTeamBlockers from '@client/scripts/teamBlockers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

type CommandHookCallback = (command: string, echo?: boolean, options?: any) => string | null | undefined;

class FakeClient {
  Map: { moveBack: jest.Mock; setBlockable: jest.Mock; isBlockable: boolean };
  TeamManager: { isInAnyTeam: jest.Mock; isLeader: jest.Mock };
  Triggers: Triggers;
  private commandHooks: { id: string; callback: CommandHookCallback }[] = [];

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

  registerCommandHook(id: string, callback: CommandHookCallback) {
    this.commandHooks.push({ id, callback });
  }

  simulateCommand(command: string) {
    for (const hook of this.commandHooks) {
      hook.callback(command);
    }
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

  test('moves back when player is not in team but does not set blockable', () => {
    client.Map.isBlockable = true;
    client.TeamManager.isInAnyTeam.mockReturnValue(false);

    parse(blockerLine);

    expect(client.Map.moveBack).toHaveBeenCalled();
    expect(client.Map.setBlockable).not.toHaveBeenCalled();
  });

  test('moves back when player is team leader but does not set blockable', () => {
    client.Map.isBlockable = true;
    client.TeamManager.isInAnyTeam.mockReturnValue(true);
    client.TeamManager.isLeader.mockReturnValue(true);

    parse(blockerLine);

    expect(client.Map.moveBack).toHaveBeenCalled();
    expect(client.Map.setBlockable).not.toHaveBeenCalled();
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

  describe('move-dependent blocker', () => {
    const kultystkaLine = 'Bialowlosa ociezala kultystka nie pozwoli ci zblizyc sie do drzwi.';

    test('moves back when preceded by a direction command', () => {
      client.simulateCommand('n');
      parse(kultystkaLine);
      expect(client.Map.moveBack).toHaveBeenCalled();
    });

    test('moves back when preceded by a Polish direction command', () => {
      client.simulateCommand('po\u0142noc');
      parse(kultystkaLine);
      expect(client.Map.moveBack).toHaveBeenCalled();
    });

    test('moves back when preceded by przemknij direction', () => {
      client.simulateCommand('przemknij n');
      parse(kultystkaLine);
      expect(client.Map.moveBack).toHaveBeenCalled();
    });

    test('does not move back when preceded by a non-direction command', () => {
      client.simulateCommand('otworz drzwi');
      parse(kultystkaLine);
      expect(client.Map.moveBack).not.toHaveBeenCalled();
    });

    test('does not move back when no command was sent', () => {
      parse(kultystkaLine);
      expect(client.Map.moveBack).not.toHaveBeenCalled();
    });
  });
});
