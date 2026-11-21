import { PipView } from '@web/objectList/pip/PipView';
import { buildRenderContext } from '@web/objectList/context';
import { renderNode } from '../renderView';

const client = { TeamManager: { isInTeam: () => false, getEnemyQueue: () => [], isLeader: () => false } } as any;

describe('PipView', () => {
  test('omits the header and footer when they have nothing to show', () => {
    const ctx = buildRenderContext(client, [{ shortcut: '1', desc: 'Ork', num: 1 }, { shortcut: '2', desc: 'Goblin', num: 2 }], 'zabij');
    const root = renderNode(<PipView locationText="" coverTimerText="" ctx={ctx} lastOutputHtml="" />);
    expect(root.querySelector('.objects-list-pip-header')).toBeNull();
    expect(root.querySelector('.objects-list-pip-footer')).toBeNull();
    const body = root.querySelector('.objects-list-pip-body')!;
    expect(body.querySelectorAll('br')).toHaveLength(1);
    expect(body.textContent).toContain('Ork');
    expect(body.textContent).toContain('Goblin');
  });

  test('shows the placeholder with no objects', () => {
    const root = renderNode(<PipView locationText="" coverTimerText="" ctx={null} lastOutputHtml="" />);
    expect(root.querySelector('.objects-list-pip-body')!.textContent).toBe('Brak obiektów');
  });

  test('shows the header as text and the footer as the output HTML', () => {
    const root = renderNode(<PipView locationText="<Gate>" coverTimerText="Zas: OK" ctx={null} lastOutputHtml="<b>x</b>" />);
    expect(root.querySelector('.objects-list-pip-header')!.textContent).toBe('<Gate> • Zas: OK');
    expect(root.querySelector('.objects-list-pip-footer-content')!.innerHTML).toBe('<b>x</b>');
  });
});
