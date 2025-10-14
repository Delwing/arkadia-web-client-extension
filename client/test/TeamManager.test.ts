import TeamManager from '../src/TeamManager';
import Triggers from '../src/Triggers';
import appEventBus from '../src/events/app-event-bus';

class FakeClient {
  Triggers = new Triggers({} as any);
  println = jest.fn();
}

function sendEvent(type: string, detail?: any) {
  appEventBus.emit(type as any, detail);
}

describe('TeamManager', () => {
  let client: FakeClient;
  let manager: TeamManager;

  beforeEach(() => {
    appEventBus.clear();
    client = new FakeClient();
    manager = new TeamManager((client as unknown) as any);
    sendEvent('gmcp.char.info', { object_num: '99' });
  });

  afterEach(() => {
    appEventBus.clear();
  });

  test('adds member from gmcp objects', () => {
    sendEvent('gmcp.objects.data', {
      '1': { desc: 'Pablo', living: true, team: true },
    });
    expect(manager.isInTeam('Pablo')).toBe(true);
  });

  test('removes member on leave message', () => {
    sendEvent('gmcp.objects.data', {
      '1': { desc: 'Vesper', living: true, team: true },
    });
    client.Triggers.parseLine('Vesper porzuca twoja druzyne.', '');
    expect(manager.isInTeam('Vesper')).toBe(false);
  });

  test('clears team on clear message', () => {
    sendEvent('gmcp.objects.data', {
      '1': { desc: 'Bob', living: true, team: true },
    });
    client.Triggers.parseLine('Nie jestes w zadnej druzynie.', '');
    expect(manager.getTeamMembers()).toEqual([]);
  });

  test('full sync message sets leader and members', () => {
    client.Triggers.parseLine('Druzyne prowadzi Vesper i oprocz ciebie sa w niej jeszcze: Pablo i Opeteh.', '');
    expect(manager.getLeader()).toBe('Vesper');
    const members = manager.getTeamMembers();
    expect(members).toEqual(expect.arrayContaining(['Vesper', 'Pablo', 'Opeteh']));
    expect(manager.isInTeam('Pablo')).toBe(true);
  });

  test('returns leader id when available', () => {
    sendEvent('gmcp.objects.data', {
      '5': { desc: 'Vesper', living: true, team: true, team_leader: true },
    });
    expect(manager.getLeaderId()).toBe('5');
  });

  test('emits event when leader attacks different target', () => {
    const callback = jest.fn();
    const off = appEventBus.on('teamLeaderTargetNoAvatar', callback);
    sendEvent('gmcp.objects.data', {
      '1': {
        desc: 'Eamon',
        living: true,
        team: true,
        team_leader: true,
        attack_num: '3',
      },
      '99': { desc: 'You', living: true, team: true, attack_num: '2' },
    });
    off();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('emits event when leader attacks and avatar does not', () => {
    const callback = jest.fn();
    const off = appEventBus.on('teamLeaderTargetNoAvatar', callback);
    sendEvent('gmcp.objects.data', {
      '1': {
        desc: 'Eamon',
        living: true,
        team: true,
        team_leader: true,
        attack_num: '3',
      },
      '99': { desc: 'You', living: true, team: true, attack_num: false },
    });
    off();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  test('does not emit event when targets match', () => {
    const noAvatar = jest.fn();
    const avatar = jest.fn();
    const offNoAvatar = appEventBus.on('teamLeaderTargetNoAvatar', noAvatar);
    const offAvatar = appEventBus.on('teamLeaderTargetAvatar', avatar);
    sendEvent('gmcp.objects.data', {
      '1': {
        desc: 'Eamon',
        living: true,
        team: true,
        team_leader: true,
        attack_num: '2',
      },
      '99': { desc: 'You', living: true, team: true, attack_num: '2' },
    });
    offNoAvatar();
    offAvatar();
    expect(noAvatar).not.toHaveBeenCalled();
    expect(avatar).toHaveBeenCalledTimes(1);
  });

  test('emits event on each gmcp update while mismatch persists', () => {
    const callback = jest.fn();
    const off = appEventBus.on('teamLeaderTargetNoAvatar', callback);
    const data = {
      desc: 'Eamon',
      living: true,
      team: true,
      team_leader: true,
      attack_num: '3',
    };
    const player = { desc: 'You', living: true, team: true, attack_num: '2' };
    sendEvent('gmcp.objects.data', { '1': data, '99': player });
    sendEvent('gmcp.objects.data', { '1': data, '99': player });
    off();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('emits event again after target changes', () => {
    const callback = jest.fn();
    const off = appEventBus.on('teamLeaderTargetNoAvatar', callback);
    sendEvent('gmcp.objects.data', {
      '1': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: '3' },
      '99': { desc: 'You', living: true, team: true, attack_num: '2' },
    });
    sendEvent('gmcp.objects.data', {
      '1': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: '2' },
      '99': { desc: 'You', living: true, team: true, attack_num: '2' },
    });
    sendEvent('gmcp.objects.data', {
      '1': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: '3' },
      '99': { desc: 'You', living: true, team: true, attack_num: '2' },
    });
    off();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('emits event again when leader number changes', () => {
    const callback = jest.fn();
    const off = appEventBus.on('teamLeaderTargetNoAvatar', callback);
    sendEvent('gmcp.objects.data', {
      '1': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: '3' },
      '99': { desc: 'You', living: true, team: true, attack_num: '2' },
    });
    sendEvent('gmcp.objects.data', {
      '2': { desc: 'Eamon', living: true, team: true, team_leader: true, attack_num: '3' },
      '99': { desc: 'You', living: true, team: true, attack_num: '2' },
    });
    off();
    expect(callback).toHaveBeenCalledTimes(2);
  });

  test('stores attack and defense target ids', () => {
    sendEvent('gmcp.objects.data', {
      '1': { desc: 'Bob', living: true, team: true, attack_target: true },
      '2': { desc: 'Alice', living: true, team: true, defense_target: true },
    });
    expect(manager.getAttackTargetId()).toBe('1');
    expect(manager.getDefenseTargetId()).toBe('2');
  });

  test('returns avatar attack target id', () => {
    sendEvent('gmcp.objects.data', {
      '99': { desc: 'You', living: true, team: true, attack_num: '4' },
    });
    expect(manager.getAvatarAttackTargetId()).toBe('4');
  });

  test('manages attack queue entries', () => {
    expect(manager.addEnemyToQueue('5')).toBe(true);
    expect(manager.addEnemyToQueue('5')).toBe(false);
    expect(manager.getEnemyQueue()).toEqual(['5']);
    expect(manager.shiftEnemyFromQueue()).toBe('5');
    expect(manager.shiftEnemyFromQueue()).toBeUndefined();
  });

  test('removes enemies missing from gmcp objects nums after repeated updates', () => {
    manager.addEnemyToQueue('5');
    manager.addEnemyToQueue('6');
    sendEvent('gmcp.objects.nums', { nums: ['6'] });
    expect(manager.getEnemyQueue()).toEqual(['5', '6']);
    sendEvent('gmcp.objects.nums', { nums: ['6'] });
    expect(manager.getEnemyQueue()).toEqual(['6']);
  });

  test('restores pending removal when enemy reappears in gmcp objects nums', () => {
    manager.addEnemyToQueue('5');
    manager.addEnemyToQueue('6');
    sendEvent('gmcp.objects.nums', { nums: ['6'] });
    sendEvent('gmcp.objects.nums', { nums: ['5', '6'] });
    expect(manager.getEnemyQueue()).toEqual(['5', '6']);
  });

  test('clears attack queue on new location', () => {
    manager.addEnemyToQueue('7');
    sendEvent('gmcp.room.info', { num: 123 });
    expect(manager.getEnemyQueue()).toEqual([]);
  });

  test('removes enemy from queue when marked as not living', () => {
    manager.addEnemyToQueue('8');
    sendEvent('gmcp.objects.data', { '8': { living: false } });
    expect(manager.getEnemyQueue()).toEqual([]);
  });

  test('notifies about next enemy in queue when the current one dies', () => {
    manager.addEnemyToQueue('8');
    manager.addEnemyToQueue('9');
    sendEvent('gmcp.objects.data', {
      '9': { desc: 'Drugi przeciwnik', living: true },
    });
    client.println.mockClear();
    sendEvent('gmcp.objects.data', { '8': { living: false } });
    expect(client.println).toHaveBeenCalledWith(
      '<span style="color:orange">/nn zeby zaatakowac nastepny cel: Drugi przeciwnik</span>',
    );
  });

  test('falls back to object id when description is missing', () => {
    manager.addEnemyToQueue('8');
    manager.addEnemyToQueue('10');
    client.println.mockClear();
    sendEvent('gmcp.objects.data', { '8': { living: false } });
    expect(client.println).toHaveBeenCalledWith(
      '<span style="color:orange">/nn zeby zaatakowac nastepny cel: ob_10</span>',
    );
  });

});
