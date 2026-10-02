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

describe('special exit button macro', () => {
    const withExits = () => ({
        ...makeClient(null),
        Map: { currentRoom: { specialExits: { 'wejdz do namiotu': 1, 'wespnij sie na drzewo': 2 } } },
    });

    test('takes the first special exit by default', () => {
        const client = withExits();
        executeMacro(client as never, 'specialExit', { macroType: 'specialExit' });
        expect(client.sendCommand).toHaveBeenCalledWith('wejdz do namiotu');
    });

    test('takes the chosen special exit', () => {
        const client = withExits();
        executeMacro(client as never, 'specialExit', { macroType: 'specialExit', exitIndex: 1 });
        expect(client.sendCommand).toHaveBeenCalledWith('wespnij sie na drzewo');
    });

    test('does nothing when the room has fewer special exits', () => {
        const client = withExits();
        executeMacro(client as never, 'specialExit', { macroType: 'specialExit', exitIndex: 2 });
        expect(client.sendCommand).not.toHaveBeenCalled();
    });
});
