import { getStrategy } from '@web/objectList/strategies';
import { buildRenderContext } from '@web/objectList/context';
import { objectListFilters } from '@modules/core/objectListFilters';

function makeClient(opts: { queue?: number[]; team?: string[]; leader?: boolean } = {}) {
  const team = opts.team ?? [];
  return {
    TeamManager: {
      isInTeam: (desc: string) => team.includes(desc),
      getEnemyQueue: () => opts.queue ?? [],
      isLeader: () => opts.leader ?? false,
    },
  } as any;
}

function renderNearby(objects: any[], client = makeClient()) {
  const ctx = buildRenderContext(client, objects, 'zabij');
  return getStrategy('nearby').render(ctx);
}

describe('nearby ("W poblizu") strategy', () => {
  afterEach(() => {
    objectListFilters.clear();
  });

  test('marks the next queued enemy with the gold key', () => {
    const html = renderNearby(
      [
        { shortcut: '1', desc: 'Ork', num: 123, hp: 4 },
        { shortcut: '2', desc: 'Goblin', num: 456, hp: 4 },
      ],
      makeClient({ queue: [123] }),
    );
    document.body.innerHTML = html;

    const marked = document.querySelector('.obj__key.next-target') as HTMLElement;
    expect(marked).toBeTruthy();
    expect(marked.closest('.obj')!.getAttribute('data-object-id')).toBe('123');
    expect(marked.closest('.obj')!.classList.contains('obj--next-queued')).toBe(true);

    const other = document.querySelector('.obj[data-object-id="456"]') as HTMLElement;
    expect(other.querySelector('.obj__key.next-target')).toBeNull();
    expect(other.classList.contains('obj--next-queued')).toBe(false);
  });

  test('does not mark when the queued enemy is not on the location', () => {
    const html = renderNearby(
      [{ shortcut: '1', desc: 'Goblin', num: 456, hp: 4 }],
      makeClient({ queue: [999] }),
    );
    document.body.innerHTML = html;
    expect(document.querySelector('.obj__key.next-target')).toBeNull();
    expect(document.querySelector('.obj--next-queued')).toBeNull();
  });

  test('applies objectListFilters style and content overrides', () => {
    objectListFilters.register('test-filter', (_ctx, result) => {
      result.style.descriptionColor = 'rgb(1, 2, 3)';
      result.style.descriptionBackgroundColor = 'rgb(4, 5, 6)';
      result.style.italic = true;
      result.style.cssClasses = ['custom-row'];
      result.style.prefix = '[P]';
      result.style.suffix = '[S]';
      result.style.hpBarColor = 'rgb(7, 8, 9)';
      result.content.description = 'Przefiltrowany';
    });

    document.body.innerHTML = renderNearby([{ shortcut: '1', desc: 'Ork', num: 123, hp: 4 }]);

    const row = document.querySelector('.obj') as HTMLElement;
    expect(row.classList.contains('custom-row')).toBe(true);

    const name = row.querySelector('.obj__name') as HTMLElement;
    expect(name.textContent).toBe('[P]Przefiltrowany[S]');
    expect(name.classList.contains('is-italic')).toBe(true);

    // A background marks the whole row (like the next-target wash), carrying the
    // filter's colours as vars so each UI decides how strong the wash reads.
    expect(row.classList.contains('obj--marked')).toBe(true);
    expect(row.style.getPropertyValue('--mark-fg')).toBe('rgb(1, 2, 3)');
    expect(row.style.getPropertyValue('--mark-bg')).toBe('rgb(4, 5, 6)');
    // The wash owns the name colour, so no literal filter colour is inlined.
    expect(name.style.color).toBe('');

    const hp = row.querySelector('.obj__hp') as HTMLElement;
    expect(hp.style.getPropertyValue('--hue')).toBe('rgb(7, 8, 9)');
  });

  test('a colour with no background recolours the name directly', () => {
    objectListFilters.register('test-color-only', (_ctx, result) => {
      result.style.descriptionColor = 'rgb(9, 9, 9)';
    });

    document.body.innerHTML = renderNearby([{ shortcut: '1', desc: 'Ork', num: 123, hp: 4 }]);

    const name = document.querySelector('.obj__name') as HTMLElement;
    expect(name.style.color).toBe('rgb(9, 9, 9)');
    expect(document.querySelector('.obj--marked')).toBeNull();
  });

  test('a marked row keeps the gold key but outranks the next-target wash', () => {
    objectListFilters.register('test-mark', (_ctx, result) => {
      result.style.descriptionBackgroundColor = '#ffffff';
      result.style.descriptionColor = '#000000';
    });

    document.body.innerHTML = renderNearby(
      [{ shortcut: '1', desc: 'Ork', num: 123, hp: 4 }],
      makeClient({ queue: [123] }),
    );

    const row = document.querySelector('.obj') as HTMLElement;
    // Both states are present: the row carries the mark (which wins the background
    // via the doubled-class rule) while the key still says "next in the queue".
    expect(row.classList.contains('obj--marked')).toBe(true);
    expect(row.classList.contains('obj--next-queued')).toBe(true);
    expect(row.querySelector('.obj__key.next-target')).toBeTruthy();
  });

  test('applies objectListFilters numberLabel and hpBar content overrides', () => {
    objectListFilters.register('test-content', (_ctx, result) => {
      result.content.numberLabel = '<i>X</i>';
      result.content.hpBar = '<b class="custom-hp">HP!</b>';
    });

    document.body.innerHTML = renderNearby([{ shortcut: '1', desc: 'Ork', num: 123, hp: 4 }]);

    const key = document.querySelector('.obj__key') as HTMLElement;
    expect(key.textContent).toBe('X');
    // the key stays clickable so the attack affordance is not lost
    expect(key.classList.contains('is-clickable')).toBe(true);
    expect(key.getAttribute('data-object-id')).toBe('123');

    const hp = document.querySelector('.obj__hp') as HTMLElement;
    expect(hp.classList.contains('obj__hp--custom')).toBe(true);
    expect(hp.querySelector('.custom-hp')).toBeTruthy();
    expect(hp.classList.contains('is-clickable')).toBe(true);
    expect(hp.getAttribute('data-object-num')).toBe('1');
  });

  test('filter context carries the next-target flag', () => {
    const seen: Record<string, boolean> = {};
    objectListFilters.register('test-ctx', (ctx) => {
      seen[ctx.rawDescription] = ctx.isNextTarget;
    });

    renderNearby(
      [
        { shortcut: '1', desc: 'Ork', num: 123, hp: 4 },
        { shortcut: '2', desc: 'Goblin', num: 456, hp: 4 },
      ],
      makeClient({ queue: [123] }),
    );

    expect(seen).toEqual({ Ork: true, Goblin: false });
  });
});
