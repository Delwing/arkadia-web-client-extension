import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import Client from '@client/Client';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage } from '@modules/core/storage';
import initChatHistory, { getChatHistory } from '@client/scripts/chatHistory';

function createClient(printed: string[]): Client {
    return new Client({
        send: () => {},
        output: (out?: string | AnsiAwareBuffer) => {
            printed.push(typeof out === 'string' ? out : (out?.text ?? ''));
        },
        sendGmcp: () => {},
        flushMessageBuffer: () => {},
        emit: () => {},
        shouldEchoCommand: () => false,
    });
}

describe('chatHistory', () => {
    let client: Client;
    let printed: string[];

    function output() {
        client.sendEvent('output-sent', 1);
        const s = printed.join('');
        printed.length = 0;
        return s;
    }

    function say(text: string, type: 'gmcp_msg.comm' | 'gmcp_msg.emote' = 'gmcp_msg.comm') {
        client.sendEvent(type, new AnsiAwareBuffer(text) as any);
    }

    function texts() {
        return getChatHistory().map(e => e.buffer.text);
    }

    // initChatHistory subscribes to the global bus and writes into a
    // module-level history array. Re-initialising per test would make every
    // message land N times, so init once and reset the state instead.
    beforeAll(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        printed = [];
        client = createClient(printed);
        initChatHistory(client, client.aliases);
    });

    beforeEach(() => {
        characterStorage.setCharacter('TestChar');
        printed.length = 0;
        client.TeamManager.getTeamMembers = () => [];
        client.sendEvent('reset');
    });

    afterEach(() => {
        client.sendEvent('reset');
    });

    describe('capturing', () => {
        test('a chat message is recorded', () => {
            say('Ala mowi: czesc!');

            expect(texts()).toEqual(['Ala mowi: czesc!']);
        });

        test('emotes are recorded too', () => {
            say('Ala usmiecha sie.', 'gmcp_msg.emote');

            expect(texts()).toEqual(['Ala usmiecha sie.']);
        });

        test('a multi-line message becomes one entry per line', () => {
            say('Ala mowi: czesc!\nAla mowi: jak leci?');

            expect(texts()).toEqual(['Ala mowi: czesc!', 'Ala mowi: jak leci?']);
        });

        test('blank messages are dropped', () => {
            say('   ');

            expect(texts()).toEqual([]);
        });

        test('every entry carries a timestamp', () => {
            say('Ala mowi: czesc!');

            expect(getChatHistory()[0].timestamp).toMatch(/^\d{2}:\d{2}:\d{2}$/);
        });
    });

    describe('team attribution', () => {
        test('your own speech counts as team when you are in one', () => {
            client.TeamManager.getTeamMembers = () => ['Bela'];

            say('Mowisz: czesc!');

            expect(getChatHistory()[0].isTeamMember).toBe(true);
        });

        test('a team member speaking counts', () => {
            client.TeamManager.getTeamMembers = () => ['Bela'];

            say('Bela mowi: czesc!');

            expect(getChatHistory()[0].isTeamMember).toBe(true);
        });

        test('a stranger does not', () => {
            client.TeamManager.getTeamMembers = () => ['Bela'];

            say('Obcy mowi: czesc!');

            expect(getChatHistory()[0].isTeamMember).toBe(false);
        });

        test('with no team, nothing is team chat', () => {
            say('Mowisz: czesc!');

            expect(getChatHistory()[0].isTeamMember).toBe(false);
        });
    });

    describe('/chat', () => {
        test('says so when there is nothing yet', async () => {
            await client.sendCommand('/chat');

            expect(output()).toContain('Brak zapisanych wiadomosci czatu.');
        });

        test('prints the messages with timestamps', async () => {
            say('Ala mowi: czesc!');

            await client.sendCommand('/chat');

            const out = output();
            expect(out).toContain('Ala mowi: czesc!');
            expect(out).toMatch(/\[\d{2}:\d{2}:\d{2}\]/);
        });

        test('prints at most the last 20 messages', async () => {
            for (let i = 1; i <= 25; i++) say(`Ala mowi: ${i}`);

            await client.sendCommand('/chat');
            const out = output();

            expect(out).not.toContain('Ala mowi: 5\n');
            expect(out).toContain('Ala mowi: 25');
        });
    });

    describe('persistence', () => {
        test('history is written to character storage on reset', () => {
            say('Ala mowi: czesc!');

            client.sendEvent('reset');

            expect(characterStorage.get('chat_history')).toEqual([]);
        });

        test('a reset clears the history and announces it', () => {
            say('Ala mowi: czesc!');
            let cleared = false;
            const off = client.on('chat.cleared', () => { cleared = true; });

            client.sendEvent('reset');
            off();

            expect(texts()).toEqual([]);
            expect(cleared).toBe(true);
        });

        test('stored history is restored when the character is announced', () => {
            characterStorage.set('chat_history', [
                { timestamp: '12:00:00', segments: [{ text: 'Ala mowi: stare', state: {} }], isTeamMember: false },
            ] as any);

            client.sendEvent('gmcp.char.info', { name: 'TestChar' } as any);

            expect(texts()).toEqual(['Ala mowi: stare']);
        });

        test('malformed stored history falls back to empty', () => {
            characterStorage.set('chat_history', 'nonsense' as any);

            client.sendEvent('gmcp.char.info', { name: 'TestChar' } as any);

            expect(texts()).toEqual([]);
        });
    });

    test('a new message is announced to the popup', () => {
        const seen: any[] = [];
        const off = client.on('chat.newMessage', (e: any) => { seen.push(e); });

        say('Ala mowi: czesc!');
        off();

        expect(seen).toHaveLength(1);
        expect(seen[0].buffer.text).toBe('Ala mowi: czesc!');
    });
});
