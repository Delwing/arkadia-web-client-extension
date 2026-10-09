import { describe, expect, it } from 'vitest';
import { PeopleBrowserService } from '@web/PeopleBrowser/PeopleBrowserService.ts';
import type { PersonListEntry } from '@client/types/people';

const person = (name: string, extra: Partial<PersonListEntry> = {}): PersonListEntry => ({
    name,
    description: `opis ${name}`,
    guild: 'NPC',
    source: 'remote',
    ignored: false,
    isEnemy: false,
    isAlly: false,
    ...extra,
});

describe('PeopleBrowserService local-only filter', () => {
    it('keeps every entry changed on this device and drops untouched remote ones', () => {
        const service = new PeopleBrowserService();
        service.setData([
            person('Untouched'),
            person('Added', { source: 'local' }),
            person('Edited', { source: 'edited' }),
            person('Ignored', { ignored: true }),
            person('Enemy', { isEnemy: true }),
            person('Ally', { isAlly: true }),
            person('Coloured', { color: '#ff0000' }),
            person('Noted', { note: 'handluje ziolami' }),
        ]);

        const result = service.query({
            searchTerm: '',
            guildFilter: '',
            statusFilter: '',
            localOnly: true,
            pageSize: 20,
            page: 0,
        });

        expect(result.items.map(p => p.name).sort()).toEqual(
            ['Added', 'Ally', 'Coloured', 'Edited', 'Enemy', 'Ignored', 'Noted'],
        );
    });
});
