import { executeMacro } from '@web/scripts/buttonMacroExecutor';

function makeClient(carriageStopCommand: string | null) {
    return {
        carriageStopCommand,
        sendCommand: jest.fn(),
        Map: { currentRoom: null },
    };
}

describe('zerknij button macro', () => {
    test('looks around when nothing is rolling', () => {
        const client = makeClient(null);
        executeMacro(client as never, 'zerknij', { macroType: 'zerknij' });
        expect(client.sendCommand).toHaveBeenCalledWith('zerknij');
    });

    test('halts the carriage mid-ride, like the numpad key', () => {
        const client = makeClient('zatrzymaj woz');
        executeMacro(client as never, 'zerknij', { macroType: 'zerknij' });
        expect(client.sendCommand).toHaveBeenCalledWith('zatrzymaj woz');
    });

    test('as a compound step it halts the carriage too', () => {
        const client = makeClient('zatrzymaj bryczke');
        executeMacro(client as never, 'compound', {
            macroType: 'compound',
            steps: [{ macroType: 'zerknij' }, { macroType: 'command', command: 'ekwipunek' }],
        });
        expect(client.sendCommand.mock.calls.flat()).toEqual(['zatrzymaj bryczke', 'ekwipunek']);
    });

    test('a plain command button is left alone even while riding', () => {
        const client = makeClient('zatrzymaj woz');
        executeMacro(client as never, 'command', { macroType: 'command', command: 'zerknij' });
        expect(client.sendCommand).toHaveBeenCalledWith('zerknij');
    });
});
