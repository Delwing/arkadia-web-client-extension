import { executeMacro } from '@web/scripts/buttonMacroExecutor';

function makeClient(carriageStopCommand: string | null) {
    return {
        carriageStopCommand,
        sendCommand: jest.fn(),
        Map: { currentRoom: null },
    };
}

describe('button "zerknij" macro', () => {
    test('halts the carriage mid-ride instead of looking around', () => {
        const client = makeClient('zatrzymaj woz');
        executeMacro(client as never, 'command', { command: 'zerknij' } as never);
        expect(client.sendCommand).toHaveBeenCalledWith('zatrzymaj woz');
    });

    test('looks around when nothing is rolling', () => {
        const client = makeClient(null);
        executeMacro(client as never, 'command', { command: 'zerknij' } as never);
        expect(client.sendCommand).toHaveBeenCalledWith('zerknij');
    });

    test('only the zerknij line of a multi-command button is redirected', () => {
        const client = makeClient('zatrzymaj bryczke');
        executeMacro(client as never, 'command', { command: 'zerknij\nekwipunek' } as never);
        expect(client.sendCommand.mock.calls.flat()).toEqual(['zatrzymaj bryczke', 'ekwipunek']);
    });

    test('a kierunek button bound to zerknij halts the carriage too', () => {
        const client = makeClient('zatrzymaj dylizans');
        executeMacro(client as never, 'kierunek', { direction: 'zerknij' } as never);
        expect(client.sendCommand).toHaveBeenCalledWith('zatrzymaj dylizans');
    });

    test('other direction buttons are untouched while riding', () => {
        const client = makeClient('zatrzymaj woz');
        executeMacro(client as never, 'kierunek', { direction: 'polnoc' } as never);
        expect(client.sendCommand).toHaveBeenCalledWith('polnoc');
    });
});
