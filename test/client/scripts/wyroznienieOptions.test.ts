import initWyroznienieOptions from '@client/scripts/wyroznienieOptions';
import Triggers from '@client/Triggers';
import {AnsiAwareBuffer} from '@client/ansi/FormatState';
import {createColorFormat} from '@modules/core/Colors';

const LABEL = 'Tytul zwiazany z WYROZNIENIEm:';
const GAME_COLOR = createColorFormat('#c0c000');

function setup() {
    const client = {
        Triggers: new Triggers({} as any),
        sendCommand: vi.fn(),
    };
    initWyroznienieOptions(client as any);
    return client;
}

function headerLine(title: string) {
    const line = new AnsiAwareBuffer();
    line.append(LABEL, GAME_COLOR);
    line.append(` ${title}`);
    return line;
}

describe('wyroznienieOptions - naglowek', () => {
    test.each(['Szlachcic', 'Niewidoczny'])('etykieta zachowuje oryginalny kolor (%s)', title => {
        const client = setup();
        const result = client.Triggers.parseLine(headerLine(title), 'text')!;

        expect(result.getStateAt(0)?.foreground).toEqual(GAME_COLOR.foreground);
        expect(result.getStateAt(LABEL.length - 1)?.foreground).toEqual(GAME_COLOR.foreground);
        expect(result.getStateAt(LABEL.length + 1)?.foreground).not.toEqual(GAME_COLOR.foreground);
    });

    test('dokleja przycisk wylacz', () => {
        const client = setup();
        const result = client.Triggers.parseLine(headerLine('Szlachcic'), 'text')!;

        expect(result.text).toBe(`${LABEL} Szlachcic [ wylacz ]`);
    });
});
