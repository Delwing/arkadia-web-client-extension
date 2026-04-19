import TeamManager from '@client/TeamManager';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { EventEmitter } from 'events';

class FakeClient {
  private emitter = new EventEmitter();
  Triggers = new Triggers({} as any);
  println = jest.fn();
  sendGMCP = jest.fn();
  ObjectManager = { getObjectsOnLocation: jest.fn().mockReturnValue([]) };
  on(event: string, cb: any) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }
  off(event: string, cb: any) {
    this.emitter.off(event, cb);
  }
  sendEvent(type: string, ...args: any[]) {
    this.emitter.emit(type, ...args);
  }
}

describe('TeamManager', () => {
  let client: FakeClient;
  let manager: TeamManager;

  beforeEach(() => {
    client = new FakeClient();
    manager = new TeamManager((client as unknown) as any);
    client.sendEvent('gmcp.char.info', { object_num: 99 });
  });

  test('adds member from gmcp objects', () => {
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Pablo', living: true, team: true },
    });
    expect(manager.isInTeam('Pablo')).toBe(true);
  });

  test('renames member when partial gmcp update changes desc (introduction)', () => {
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'masywny ponury krasnolud', living: true, team: true },
    });
    expect(manager.isInTeam('masywny ponury krasnolud')).toBe(true);

    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Delwing' },
    });
    expect(manager.isInTeam('Delwing')).toBe(true);
    expect(manager.isInTeam('masywny ponury krasnolud')).toBe(false);
    expect(manager.getTeamMemberObjectId('Delwing')).toBe(1);
  });

  test('renames leader on partial desc update', () => {
    client.sendEvent('gmcp.objects.data', {
      '5': { desc: 'zakapturzony elf', living: true, team: true, team_leader: true },
    });
    expect(manager.getLeader()).toBe('zakapturzony elf');

    client.sendEvent('gmcp.objects.data', {
      '5': { desc: 'Vesper' },
    });
    expect(manager.getLeader()).toBe('Vesper');
    expect(manager.getLeaderId()).toBe(5);
    expect(manager.isInTeam('Vesper')).toBe(true);
  });

  test('removes member on leave message', () => {
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Vesper', living: true, team: true },
    });
    client.Triggers.parseLine(new AnsiAwareBuffer('Vesper porzuca twoja druzyne.'), '');
    expect(manager.isInTeam('Vesper')).toBe(false);
  });

  test('clears team on clear message', () => {
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Bob', living: true, team: true },
    });
    client.Triggers.parseLine(new AnsiAwareBuffer('Nie jestes w zadnej druzynie.'), '');
    expect(manager.getTeamMembers()).toEqual([]);
  });

  test('Druzyne prowadzi does not add members, requests gmcp refresh', () => {
    client.Triggers.parseLine(new AnsiAwareBuffer('Druzyne prowadzi Vesper i oprocz ciebie sa w niej jeszcze: Pablo i Opeteh.'), '');
    expect(manager.getTeamMembers()).toEqual([]);
    expect(manager.getLeader()).toBeUndefined();
    expect(client.sendGMCP).toHaveBeenCalledWith('objects.nums');
    expect(client.sendGMCP).toHaveBeenCalledWith('objects.data');
  });

  test('Druzyne prowadzi members and leader come from gmcp', () => {
    client.Triggers.parseLine(new AnsiAwareBuffer('Druzyne prowadzi Vesper i oprocz ciebie sa w niej jeszcze: Pablo i Opeteh.'), '');
    client.sendEvent('gmcp.objects.data', {
      '5': { desc: 'Vesper', living: true, team: true, team_leader: true },
      '6': { desc: 'Pablo', living: true, team: true },
      '7': { desc: 'Opeteh', living: true, team: true },
    });
    expect(manager.getLeader()).toBe('Vesper');
    expect(manager.getLeaderId()).toBe(5);
    expect(manager.isInTeam('Pablo')).toBe(true);
    expect(manager.isInTeam('Opeteh')).toBe(true);
  });

  test('Przewodzisz druzynie does not add members, requests gmcp refresh', () => {
    client.Triggers.parseLine(new AnsiAwareBuffer('Przewodzisz druzynie, w ktorej oprocz ciebie sa jeszcze: Pablo i Vesper.'), '');
    expect(manager.getTeamMembers()).toEqual([]);
    expect(client.sendGMCP).toHaveBeenCalledWith('objects.nums');
    expect(client.sendGMCP).toHaveBeenCalledWith('objects.data');
  });

  test('returns leader id when available', () => {
    client.sendEvent('gmcp.objects.data', {
      '5': { desc: 'Vesper', living: true, team: true, team_leader: true },
    });
    expect(manager.getLeaderId()).toBe(5);
  });

  test('emits event when leader attacks different target', () => {
    const callback = jest.fn();
    client.on('teamLeaderTargetNoAvatar', callback);
    client.sendEvent('gmcp.objects.data', {
      '1': {
        desc: 'Eamon',
        living: true,
        team: true,
        team_leader: true,
        attack_num: 3,
      },
      '99': { desc: 'You', living: true, team: true, attack_num: 2 },
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('emits event when leader attacks and avatar does not', () => {
    const callback = jest.fn();
    client.on('teamLeaderTargetNoAvatar', callback);
    client.sendEvent('gmcp.objects.data', {
      '1': {
        desc: 'Eamon',
        living: true,
        team: true,
        team_leader: true,
        attack_num: 3,
      },
      '99': { desc: 'You', living: true, team: true, attack_num: false },
    });
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('does not emit event when targets match', () => {
    const noAvatar = jest.fn();
    const avatar = jest.fn();
    client.on('teamLeaderTargetNoAvatar', noAvatar);
    client.on('teamLeaderTargetAvatar', avatar);
    client.sendEvent('gmcp.objects.data', {
      '1': {
        desc: 'Eamon',
        living: true,
        team: true,
        team_leader: true,
        attack_num: 2,
      },
      '99': { desc: 'You', living: true, team: true, attack_num: 2 },
    });
    expect(noAvatar).not.toHaveBeenCalled();
    expect(avatar).toHaveBeenCalledTimes(1);
  });

  test('emits event on each gmcp update while mismatch persists', () => {
    const callback = jest.fn();
    client.on('teamLeaderTargetNoAvatar', callback);
    const data = {
      desc: 'Eamon',
      living: true,
      team: true,
      team_leader: true,
      attack_num: '3',
    };
    const player = { desc: 'You', living: true, team: true, attack_num: 2 };
    client.sendEvent('gmcp.objects.data', { '1': data, '99': player });
    client.sendEvent('gmcp.objects.data', { '1': data, '99': player });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('emits event again after target changes', () => {
    const callback = jest.fn();
    client.on('teamLeaderTargetNoAvatar', callback);
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: '3' },
      '99': { desc: 'You', living: true, team: true, attack_num: 2 },
    });
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: 2 },
      '99': { desc: 'You', living: true, team: true, attack_num: 2 },
    });
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: '3' },
      '99': { desc: 'You', living: true, team: true, attack_num: 2 },
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('emits event again when leader number changes', () => {
    const callback = jest.fn();
    client.on('teamLeaderTargetNoAvatar', callback);
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: '3' },
      '99': { desc: 'You', living: true, team: true, attack_num: 2 },
    });
    client.sendEvent('gmcp.objects.data', {
      '2': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: '3' },
      '99': { desc: 'You', living: true, team: true, attack_num: 2 },
    });
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('stores attack and defense target ids', () => {
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Bob', living: true, team: true, attack_target: true },
      '2': { desc: 'Alice', living: true, team: true, defense_target: true },
    });
    expect(manager.getAttackTargetId()).toBe(1);
    expect(manager.getDefenseTargetId()).toBe(2);
  });

  test('returns avatar attack target id', () => {
    client.sendEvent('gmcp.objects.data', {
      '99': { desc: 'You', living: true, team: true, attack_num: 4 },
    });
    expect(manager.getAvatarAttackTargetId()).toBe(4);
  });

  test('manages attack queue entries', () => {
    expect(manager.addEnemyToQueue(5)).toBe(true);
    expect(manager.addEnemyToQueue(5)).toBe(false);
    expect(manager.getEnemyQueue()).toEqual([5]);
    expect(manager.shiftEnemyFromQueue()).toBe(5);
    expect(manager.shiftEnemyFromQueue()).toBeUndefined();
  });

  test('removes enemies missing from gmcp objects nums after repeated updates', () => {
    manager.addEnemyToQueue(5);
    manager.addEnemyToQueue(6);
    client.sendEvent('gmcp.objects.nums', [6]);
    expect(manager.getEnemyQueue()).toEqual([5, 6]);
    client.sendEvent('gmcp.objects.nums', [6]);
    expect(manager.getEnemyQueue()).toEqual([6]);
  });

  test('restores pending removal when enemy reappears in gmcp objects nums', () => {
    manager.addEnemyToQueue(5);
    manager.addEnemyToQueue(6);
    client.sendEvent('gmcp.objects.nums', [6]);
    client.sendEvent('gmcp.objects.nums', [5, 6]);
    expect(manager.getEnemyQueue()).toEqual([5, 6]);
  });

  test('clears attack queue on new location', () => {
    manager.addEnemyToQueue(7);
    client.sendEvent('gmcp.room.info', { num: 123 });
    expect(manager.getEnemyQueue()).toEqual([]);
  });

  test('clears team on "Porzucasz swoja druzyne."', () => {
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Pablo', living: true, team: true },
    });
    expect(manager.isInTeam('Pablo')).toBe(true);
    client.Triggers.parseLine(new AnsiAwareBuffer('Porzucasz swoja druzyne.'), '');
    expect(manager.getTeamMembers()).toEqual([]);
    expect(manager.isInAnyTeam()).toBe(false);
  });

  test('populates team on "Dolaczasz do druzyny" with member list, leader from gmcp', () => {
    client.Triggers.parseLine(new AnsiAwareBuffer('Dolaczasz do druzyny Vesper. Od teraz jej sklad stanowicie ty, Pablo i Vesper.'), '');
    expect(manager.getLeader()).toBeUndefined();
    expect(manager.isInTeam('Pablo')).toBe(true);
    expect(manager.isInAnyTeam()).toBe(true);
    client.sendEvent('gmcp.objects.data', {
      '5': { desc: 'Vesper', living: true, team: true, team_leader: true },
    });
    expect(manager.getLeader()).toBe('Vesper');
  });

  test('populates team on "Dolaczasz do druzyny" with only leader from gmcp', () => {
    client.Triggers.parseLine(new AnsiAwareBuffer('Dolaczasz do druzyny Vesper. Od teraz jej sklad stanowicie ty i Vesper.'), '');
    expect(manager.getLeader()).toBeUndefined();
    expect(manager.isInAnyTeam()).toBe(true);
    client.sendEvent('gmcp.objects.data', {
      '5': { desc: 'Vesper', living: true, team: true, team_leader: true },
    });
    expect(manager.getLeader()).toBe('Vesper');
  });

  test('clears leader attack target when target disappears from objects.nums', () => {
    const avatarCallback = jest.fn();
    client.on('teamLeaderTargetAvatar', avatarCallback);
    // Setup leader attacking target 3
    client.sendEvent('gmcp.objects.data', {
      '1': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: 3 },
      '99': { desc: 'You', living: true, team: true, attack_num: false },
    });
    avatarCallback.mockClear();
    // Target 3 no longer visible (not in objects.nums)
    client.sendEvent('gmcp.objects.nums', [1, 99, 4, 5]);
    expect(avatarCallback).toHaveBeenCalled();
  });

  test('removes member when gmcp sends team: false', () => {
    client.sendEvent('gmcp.objects.data', {
      '42': { desc: 'Pablo', living: true, team: true },
    });
    expect(manager.isInTeam('Pablo')).toBe(true);
    client.sendEvent('gmcp.objects.data', {
      '42': { desc: 'Pablo', living: true, team: false },
    });
    expect(manager.isInTeam('Pablo')).toBe(false);
    expect(manager.getTeamMemberObjectId('Pablo')).toBeUndefined();
  });

  test('removes leader when gmcp sends team: false for leader obj_id', () => {
    client.sendEvent('gmcp.objects.data', {
      '5': { desc: 'Vesper', living: true, team: true, team_leader: true },
    });
    expect(manager.getLeader()).toBe('Vesper');
    expect(manager.getLeaderId()).toBe(5);
    client.sendEvent('gmcp.objects.data', {
      '5': { desc: 'Vesper', living: true, team: false },
    });
    expect(manager.getLeader()).toBeUndefined();
    expect(manager.getLeaderId()).toBeUndefined();
    expect(manager.isInTeam('Vesper')).toBe(false);
  });

  test('does not remove member name if another obj_id still maps to it', () => {
    client.sendEvent('gmcp.objects.data', {
      '42': { desc: 'Pablo', living: true, team: true },
      '43': { desc: 'Pablo', living: true, team: true },
    });
    expect(manager.isInTeam('Pablo')).toBe(true);
    client.sendEvent('gmcp.objects.data', {
      '42': { desc: 'Pablo', living: true, team: false },
    });
    expect(manager.isInTeam('Pablo')).toBe(true);
    expect(manager.getTeamMemberObjectId('Pablo')).toBe(43);
  });

  test('new obj_id after reconnect is not seen as team member', () => {
    client.sendEvent('gmcp.objects.data', {
      '42': { desc: 'Pablo', living: true, team: true },
    });
    expect(manager.isInTeam('Pablo')).toBe(true);
    // Player reconnects with new obj_id, not in team
    client.sendEvent('gmcp.objects.data', {
      '55': { desc: 'Pablo', living: true, team: false },
    });
    // Old obj_id still thinks Pablo is in team, but new one says no
    // The old entry remains until explicitly cleared
    // The key behavior: obj_id 55 is NOT a team member
    expect(manager.getTeamMemberObjectId('Pablo')).toBe(42);
  });

  test('getTeamMemberObjectId resolves name to object id', () => {
    client.sendEvent('gmcp.objects.data', {
      '42': { desc: 'Pablo', living: true, team: true },
    });
    expect(manager.getTeamMemberObjectId('Pablo')).toBe(42);
  });

  test('getTeamMemberObjectId is case insensitive', () => {
    client.sendEvent('gmcp.objects.data', {
      '42': { desc: 'Pablo', living: true, team: true },
    });
    expect(manager.getTeamMemberObjectId('pablo')).toBe(42);
    expect(manager.getTeamMemberObjectId('PABLO')).toBe(42);
    expect(manager.getTeamMemberObjectId('PaBlO')).toBe(42);
  });

  test('getTeamMemberObjectId returns undefined for unknown name', () => {
    client.sendEvent('gmcp.objects.data', {
      '42': { desc: 'Pablo', living: true, team: true },
    });
    expect(manager.getTeamMemberObjectId('Vesper')).toBeUndefined();
  });

  test('getTeamMembersOnLocation returns team members from ObjectManager', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { num: 99, desc: 'You', __category: 'player' },
      { num: 42, desc: 'Pablo', __category: 'team' },
      { num: 44, desc: 'Opeteh', __category: 'team' },
      { num: 50, desc: 'Goblin', __category: 'rest' },
    ]);
    expect(manager.getTeamMembersOnLocation()).toEqual(['Pablo', 'Opeteh']);
  });

  test('getTeamMembersOnLocation returns empty when no team members on location', () => {
    client.ObjectManager.getObjectsOnLocation.mockReturnValue([
      { num: 99, desc: 'You', __category: 'player' },
      { num: 50, desc: 'Goblin', __category: 'rest' },
    ]);
    expect(manager.getTeamMembersOnLocation()).toEqual([]);
  });

});
