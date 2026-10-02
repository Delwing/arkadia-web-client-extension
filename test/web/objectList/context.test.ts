import { getStrategy } from '@web/objectList/strategies';
import { buildRenderContext, scopeRenderContext } from '@web/objectList/context';

function makeClient(team: string[], queue: number[] = []) {
  return {
    TeamManager: {
      isInTeam: (desc: string) => team.includes(desc),
      getEnemyQueue: () => queue,
      isLeader: () => false,
    },
  } as any;
}

const objects = [
  { shortcut: '@', desc: 'Ty', num: 1, hp: 6 },
  { shortcut: '1', desc: 'Kompan', num: 2, hp: 5, attack_num: 10 },
  { shortcut: '2', desc: 'Bardzo dlugi ork', num: 10, hp: 3, attack_num: 2 },
  { shortcut: '3', desc: 'Goblin', num: 11, hp: 4 },
];

describe('scopeRenderContext', () => {
  test('all keeps every object', () => {
    const ctx = buildRenderContext(makeClient(['Kompan']), objects, 'zabij');
    expect(scopeRenderContext(ctx, 'all')).toBe(ctx);
  });

  test('team keeps the player and teammates, others the rest', () => {
    const ctx = buildRenderContext(makeClient(['Kompan']), objects, 'zabij');
    expect(scopeRenderContext(ctx, 'team').objects.map(o => o.num)).toEqual([1, 2]);
    expect(scopeRenderContext(ctx, 'others').objects.map(o => o.num)).toEqual([10, 11]);
  });

  test('pads the list to the widest name of its own side', () => {
    const ctx = buildRenderContext(makeClient(['Kompan']), objects, 'zabij');
    expect(scopeRenderContext(ctx, 'team').descWidth).toBe('Kompan'.length);
    expect(scopeRenderContext(ctx, 'others').descWidth).toBe('Bardzo dlugi ork'.length);
  });

  test('attacker arrows still see the other side', () => {
    const ctx = buildRenderContext(makeClient(['Kompan']), objects, 'zabij');
    const teamHtml = getStrategy('list').render(scopeRenderContext(ctx, 'team'));
    const othersHtml = getStrategy('list').render(scopeRenderContext(ctx, 'others'));
    // The ork (2) attacks Kompan, the teammate (1) attacks the ork.
    expect(teamHtml).not.toContain('Goblin');
    expect(teamHtml).toContain(' <- 2');
    expect(othersHtml).not.toContain('Kompan');
    expect(othersHtml).toContain(' <- 1');
  });

  test('team state comes from the whole location', () => {
    const ctx = buildRenderContext(makeClient(['Kompan'], [10]), objects, 'zabij');
    const others = scopeRenderContext(ctx, 'others');
    expect(others.teamAttacking).toBe(true);
    expect(others.validNextQueuedId).toBe(10);
  });
});
