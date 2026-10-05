import initChatHistory, { getChatHistory } from '@client/scripts/chatHistory';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';

class FakeClient {
  handlers: Record<string, ((...args: any[]) => void)[]> = {};
  members: string[] = [];
  TeamManager = { getTeamMembers: () => this.members };

  on(event: string, cb: (...args: any[]) => void) {
    (this.handlers[event] ??= []).push(cb);
  }

  emit(event: string, ...args: any[]) {
    this.handlers[event]?.forEach(cb => cb(...args));
  }
}

describe('chat history team detection', () => {
  let client: FakeClient;

  const say = (line: string) => {
    client.emit('gmcp_msg.comm', new AnsiAwareBuffer(line));
    const history = getChatHistory();
    return history[history.length - 1].isTeamMember;
  };

  beforeEach(() => {
    client = new FakeClient();
    initChatHistory((client as unknown) as any);
    client.members = ['Pablo'];
  });

  test('member speaking first is team', () => {
    expect(say('Pablo mowi: czesc')).toBe(true);
  });

  test('member named after an emote prefix is team', () => {
    expect(say('Nie wyjmujac fajki z ust Pablo mowi w Mrocznej Mowie: czesc')).toBe(true);
  });

  test('own speech after an emote prefix is team', () => {
    expect(say('Usmiechajac sie mowisz: czesc')).toBe(true);
  });

  test('member named only inside the speech is not team', () => {
    expect(say('Zenon mowi: Pablo, chodz tu')).toBe(false);
  });

  test('name as part of a longer word is not team', () => {
    expect(say('Pablowski mowi: czesc')).toBe(false);
  });

  test('nothing is team without a team', () => {
    client.members = [];
    expect(say('Pablo mowi: czesc')).toBe(false);
  });
});
