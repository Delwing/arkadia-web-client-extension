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
            person('Located', { location: 1203 }),
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
            ['Added', 'Ally', 'Coloured', 'Edited', 'Enemy', 'Ignored', 'Located', 'Noted'],
        );
    });
});

const query = (searchTerm: string) => ({
    searchTerm,
    guildFilter: '',
    statusFilter: '' as const,
    localOnly: false,
    pageSize: 20 as const,
    page: 0,
});

describe('PeopleBrowserService location search', () => {
    it('finds people by the name or number of their room', () => {
        const service = new PeopleBrowserService();
        service.setData([
            person('Borgaf', { location: 4 }),
            person('Hilda', { location: 2871 }),
            person('Nowhere'),
        ]);
        service.setLocationResolver(id => ({ 4: 'Poczta', 2871: 'Sklep zielarski' } as Record<number, string>)[id]);

        expect(service.query(query('poczta')).items.map(p => p.name)).toEqual(['Borgaf']);
        expect(service.query(query('#2871')).items.map(p => p.name)).toEqual(['Hilda']);
        expect(service.query(query('2871')).items.map(p => p.name)).toEqual(['Hilda']);
    });
});

describe('PeopleBrowserService status counts', () => {
    it('counts every entry, enemies and allies regardless of filters', () => {
        const service = new PeopleBrowserService();
        service.setData([
            person('A', { isEnemy: true }),
            person('B', { isAlly: true }),
            person('C', { isAlly: true }),
            person('D'),
        ]);

        expect(service.getStatusCounts()).toEqual({ all: 4, enemy: 1, ally: 2 });
    });
});
