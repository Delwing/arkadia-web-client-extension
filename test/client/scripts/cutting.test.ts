import initCutting from '@client/scripts/cutting';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import { setTestSettings } from '../helpers/testSettings';
import { FakeClientBase } from '../helpers/fakeClient';

vi.mock('@client/scripts/bagManager', () => ({
    containerAction: jest.fn(),
}));

import { containerAction } from '@client/scripts/bagManager';

class FakeClient extends FakeClientBase {
    aliases: { pattern: RegExp; callback: (m: RegExpMatchArray) => void }[] = [];
    Triggers = new Triggers((({} as unknown) as any));
    sendCommand = jest.fn().mockResolvedValue(undefined);
    println = jest.fn();
    commandsSent: string[] = [];

    constructor() {
        super();
        this.sendCommand = jest.fn((cmd: string) => {
            this.commandsSent.push(cmd);
            return Promise.resolve();
        });
    }
}

describe('cutting/tearing system', () => {
    let client: FakeClient;
    let parse: (line: string) => AnsiAwareBuffer | null;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        characterStorage.setCharacter('TestChar');
        client = new FakeClient();
        initCutting((client as unknown) as any, client.aliases);
        parse = (line: string) => Triggers.prototype.parseLine.call(client.Triggers, new AnsiAwareBuffer(line), '');

        // Set settings via characterStorage
        characterStorage.set('settings', {
            cuttingPreAction: 'schowaj wszystko;dobadz sztylet',
            cuttingPostAction: 'schowaj sztylet;dobadz miecz'
        } as any);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        localStorage.clear();
    });

    describe('alias registration', () => {
        test('registers /wyc alias', () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'));
            expect(alias).toBeDefined();
        });

        test('registers /wycinaj alias', () => {
            const alias = client.aliases.find(a => a.pattern.test('/wycinaj'));
            expect(alias).toBeDefined();
        });

        test('registers /wyc [number] alias', () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc 3'));
            expect(alias).toBeDefined();
        });

        test('registers /wyr alias', () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyr'));
            expect(alias).toBeDefined();
        });

        test('registers /wyrywaj alias', () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyrywaj'));
            expect(alias).toBeDefined();
        });

        test('registers /wyr [number] alias', () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyr 5'));
            expect(alias).toBeDefined();
        });
    });

    describe('/wyc - cut from all bodies', () => {
        test('executes pre-actions before starting', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);

            // Allow promise chain to start
            await jest.runAllTimersAsync();

            expect(client.sendCommand).toHaveBeenCalledWith('schowaj wszystko');
            expect(client.sendCommand).toHaveBeenCalledWith('dobadz sztylet');
            expect(client.sendCommand).toHaveBeenCalledWith('policz wszystkie ciala');
        });

        test('handles body count response with "dwa"', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();

            // Simulate body count response
            parse('Doliczylas sie dwa sztuki.');
            await jest.runAllTimersAsync();

            // Should start cutting first body
            expect(client.sendCommand).toHaveBeenCalledWith('wytnij wszystko z pierwszego ciala');
        });

        test('handles body count response with "trzy"', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();

            parse('Doliczylas sie trzy sztuki.');
            await jest.runAllTimersAsync();

            expect(client.sendCommand).toHaveBeenCalledWith('wytnij wszystko z pierwszego ciala');
        });

        test('handles body count with genitive form "pieciu"', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();

            parse('Doliczylas sie pieciu sztuk.');
            await jest.runAllTimersAsync();

            expect(client.sendCommand).toHaveBeenCalledWith('wytnij wszystko z pierwszego ciala');
        });

        test('processes multiple bodies sequentially', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            // Body count: 3
            parse('Doliczylas sie trzy sztuki.');
            await jest.runAllTimersAsync();
            

            // First body cut
            parse('Wycinasz cos z pierwszego ciala.');
            await jest.runAllTimersAsync();
            

            expect(client.sendCommand).toHaveBeenCalledWith('wytnij wszystko z 2. ciala');

            // Second body cut
            parse('Wycinasz cos z drugiego ciala.');
            await jest.runAllTimersAsync();
            

            expect(client.sendCommand).toHaveBeenCalledWith('wytnij wszystko z 3. ciala');
        });

        test('puts scraps in bag after all bodies processed', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Doliczylas sie dwa sztuki.');
            await jest.runAllTimersAsync();
            

            parse('Wycinasz cos z pierwszego ciala.');
            await jest.runAllTimersAsync();
            

            parse('Wycinasz cos z drugiego ciala.');
            await jest.runAllTimersAsync();
            

            expect(containerAction).toHaveBeenCalledWith(
                expect.anything(),
                'other',
                'put',
                'wszystkie szczatki'
            );
        });

        test('executes post-actions after completion', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Doliczylas sie jeden sztuk.');
            await jest.runAllTimersAsync();
            

            parse('Wycinasz cos z pierwszego ciala.');
            await jest.runAllTimersAsync();
            

            expect(client.sendCommand).toHaveBeenCalledWith('schowaj sztylet');
            expect(client.sendCommand).toHaveBeenCalledWith('dobadz miecz');
        });

        test('handles zero bodies found', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Doliczylas sie zero sztuk.');
            await jest.runAllTimersAsync();
            

            expect(client.println).toHaveBeenCalledWith('Nie znaleziono zadnych cial do wyciecia.');
            expect(client.sendCommand).not.toHaveBeenCalledWith(expect.stringContaining('wytnij'));
        });

        test('handles "unable to cut" response', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Doliczylas sie dwa sztuki.');
            await jest.runAllTimersAsync();
            

            parse('Nie jestes w stanie tego zrobic.');
            await jest.runAllTimersAsync();
            

            // Should still try next body
            expect(client.sendCommand).toHaveBeenCalledWith('wytnij wszystko z 2. ciala');
        });

        test('handles missing body error', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Doliczylas sie jeden sztuk.');
            await jest.runAllTimersAsync();
            

            parse('Nie widzisz nigdzie w okolicy takiego ciala.');
            await jest.runAllTimersAsync();
            

            expect(containerAction).toHaveBeenCalledWith(
                expect.anything(),
                'other',
                'put',
                'wszystkie szczatki'
            );
        });

        test('handles combat interruption', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Doliczylas sie jeden sztuk.');
            await jest.runAllTimersAsync();
            

            parse('Jestes w trakcie walki - lepiej skoncentruj sie na niej.');
            await jest.runAllTimersAsync();
            

            expect(containerAction).toHaveBeenCalledWith(
                expect.anything(),
                'other',
                'put',
                'wszystkie szczatki'
            );
        });
    });

    describe('/wyr - tear from all bodies', () => {
        test('uses tear command instead of cut', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyr'))!;
            const m = '/wyr'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Doliczylas sie dwa sztuki.');
            await jest.runAllTimersAsync();
            

            expect(client.sendCommand).toHaveBeenCalledWith('wyrwij wszystko z pierwszego ciala');
        });

        test('handles tear success response', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyr'))!;
            const m = '/wyr'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Doliczylas sie dwa sztuki.');
            await jest.runAllTimersAsync();
            

            parse('Wyrywasz cos z pierwszego ciala.');
            await jest.runAllTimersAsync();
            

            expect(client.sendCommand).toHaveBeenCalledWith('wyrwij wszystko z 2. ciala');
        });
    });

    describe('/wyc [number] - cut specific body', () => {
        test('cuts from specific body number', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc 3'))!;
            const m = '/wyc 3'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            expect(client.sendCommand).toHaveBeenCalledWith('wytnij wszystko z 3. ciala');
        });

        test('executes pre-actions before cutting', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc 2'))!;
            const m = '/wyc 2'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            
            await jest.runAllTimersAsync();
            

            expect(client.sendCommand).toHaveBeenCalledWith('schowaj wszystko');
            expect(client.sendCommand).toHaveBeenCalledWith('dobadz sztylet');
        });

        test('handles single body completion', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc 1'))!;
            const m = '/wyc 1'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Wycinasz cos z pierwszego ciala.');
            await jest.runAllTimersAsync();
            

            expect(containerAction).toHaveBeenCalledWith(
                expect.anything(),
                'other',
                'put',
                'wszystkie szczatki'
            );
            expect(client.sendCommand).toHaveBeenCalledWith('schowaj sztylet');
            expect(client.sendCommand).toHaveBeenCalledWith('dobadz miecz');
        });

        test('handles "not found" for specific body', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc 5'))!;
            const m = '/wyc 5'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Nie widzisz tu niczego takiego.');
            await jest.runAllTimersAsync();
            

            expect(containerAction).toHaveBeenCalledWith(
                expect.anything(),
                'other',
                'put',
                'wszystkie szczatki'
            );
        });

        test('handles "Slucham?" response', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyc 1'))!;
            const m = '/wyc 1'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            parse('Slucham?');
            await jest.runAllTimersAsync();
            

            expect(containerAction).toHaveBeenCalledWith(
                expect.anything(),
                'other',
                'put',
                'wszystkie szczatki'
            );
        });
    });

    describe('/wyr [number] - tear specific body', () => {
        test('tears from specific body number', async () => {
            const alias = client.aliases.find(a => a.pattern.test('/wyr 4'))!;
            const m = '/wyr 4'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();
            

            expect(client.sendCommand).toHaveBeenCalledWith('wyrwij wszystko z 4. ciala');
        });
    });

    describe('settings integration', () => {
        test('handles empty pre-action settings', async () => {
            characterStorage.set('settings', {
                cuttingPreAction: '',
                cuttingPostAction: ''
            } as any);

            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();


            // Should go straight to policz command
            expect(client.sendCommand).toHaveBeenCalledWith('policz wszystkie ciala');
            expect(client.sendCommand).not.toHaveBeenCalledWith('schowaj wszystko');
        });

        test('handles undefined settings', async () => {
            setTestSettings({});

            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();


            // Should work without pre-actions
            expect(client.sendCommand).toHaveBeenCalledWith('policz wszystkie ciala');
        });

        test('handles multiple commands in pre-action', async () => {
            characterStorage.set('settings', {
                cuttingPreAction: 'cmd1;cmd2;cmd3',
                cuttingPostAction: ''
            } as any);

            const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
            const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

            alias.callback(m);
            await jest.runAllTimersAsync();


            expect(client.sendCommand).toHaveBeenCalledWith('cmd1');
            expect(client.sendCommand).toHaveBeenCalledWith('cmd2');
            expect(client.sendCommand).toHaveBeenCalledWith('cmd3');
        });
    });

    describe('Polish number word conversion', () => {
        const testCases = [
            { word: 'jeden', expected: 1 },
            { word: 'jedna', expected: 1 },
            { word: 'jedno', expected: 1 },
            { word: 'jednego', expected: 1 },
            { word: 'dwa', expected: 2 },
            { word: 'dwie', expected: 2 },
            { word: 'dwoch', expected: 2 },
            { word: 'trzy', expected: 3 },
            { word: 'trzech', expected: 3 },
            { word: 'piec', expected: 5 },
            { word: 'pieciu', expected: 5 },
            { word: 'dziesiec', expected: 10 },
            { word: 'dziesieciu', expected: 10 },
            { word: 'dwadziescia', expected: 20 },
            { word: 'dwudziestu', expected: 20 },
            { word: 'dwadziescia trzy', expected: 23 },
            { word: 'dwudziestu trzech', expected: 23 },
            { word: 'trzydziesci', expected: 30 },
        ];

        testCases.forEach(({ word, expected }) => {
            test(`converts "${word}" to ${expected}`, async () => {
                const alias = client.aliases.find(a => a.pattern.test('/wyc'))!;
                const m = '/wyc'.match(alias.pattern) as RegExpMatchArray;

                alias.callback(m);
                await jest.runAllTimersAsync();
                

                parse(`Doliczylas sie ${word} sztuk.`);
                await jest.runAllTimersAsync();
                

                // If number is valid, should send cutting command
                if (expected > 0) {
                    expect(client.sendCommand).toHaveBeenCalledWith('wytnij wszystko z pierwszego ciala');
                }
            });
        });
    });
});
