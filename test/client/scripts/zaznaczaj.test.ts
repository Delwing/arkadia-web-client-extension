vi.mock('@client/scripts/magicKeyLoader', () => ({ default: jest.fn().mockResolvedValue([]) }));
vi.mock('@client/scripts/magicsLoader', () => ({ default: jest.fn().mockResolvedValue([]) }));

import initZaznaczaj from '@client/scripts/zaznaczaj';
import Client from '@client/Client';
import type { ClientAdapter } from '@client/Client';

describe('zaznaczaj', () => {
    let client: Client;
    let mockAdapter: jest.Mocked<ClientAdapter>;

    beforeEach(() => {
        localStorage.clear();
        mockAdapter = {
            send: jest.fn(),
            output: jest.fn(),
            sendGmcp: jest.fn(),
            flushMessageBuffer: jest.fn(),
            emit: jest.fn(),
            shouldEchoCommand: jest.fn(() => true),
        };

        client = new Client(mockAdapter);
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('should register /zaznaczaj alias', () => {
        const aliases: { pattern: RegExp; callback: Function }[] = [];

        initZaznaczaj(client, aliases);

        expect(aliases.length).toBe(2);
        expect(aliases[0].pattern.source).toBe('^\\/zaznaczaj$');
        expect(aliases[1].pattern.source).toBe('^\\/zaznaczaj-$');
    });

    it('should activate highlighting when /zaznaczaj is called', () => {
        const aliases: { pattern: RegExp; callback: Function }[] = [];
        initZaznaczaj(client, aliases);

        const printlnSpy = jest.spyOn(client, 'println');
        const sendEventSpy = jest.spyOn(client, 'sendEvent');

        const zaznaczajAlias = aliases.find(a => a.pattern.source === '^\\/zaznaczaj$');
        expect(zaznaczajAlias).toBeDefined();

        zaznaczajAlias!.callback(['/zaznaczaj']);

        expect(sendEventSpy).toHaveBeenCalledWith('highlights', expect.any(Array));
        expect(printlnSpy).toHaveBeenCalledWith('Zaznaczanie lokalizacji wlaczone.');
    });

    it('should test pattern matching', () => {
        const pattern = /^\/zaznaczaj$/;

        expect('/zaznaczaj'.match(pattern)).toBeTruthy();
        expect('/zaznaczaj '.match(pattern)).toBeNull();
        expect(' /zaznaczaj'.match(pattern)).toBeNull();
        expect('/zaznaczaj-'.match(pattern)).toBeNull();
    });

    it('should test alias through client sendCommand', async () => {
        const printlnSpy = jest.spyOn(client, 'println');
        const sendEventSpy = jest.spyOn(client, 'sendEvent');

        initZaznaczaj(client, client.aliases);

        await client.sendCommand('/zaznaczaj');

        expect(sendEventSpy).toHaveBeenCalledWith('highlights', expect.any(Array));
        expect(printlnSpy).toHaveBeenCalledWith('Zaznaczanie lokalizacji wlaczone.');
    });
});
