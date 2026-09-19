import { EventEmitter } from 'events';
import PlayerIdentity from '@client/PlayerIdentity';
import { characterStorage } from '@modules/core/storage';

const TRANSFORM_LINE = 'Twoja twarz oblewa wpierw fala goraca, a pozniej niezwyklego chlodu. Wszystko to po chwili jednak mija. Czujesz jednak, ze cos sie zmienilo...';
const RESTORE_LINE = "Czujesz, ze efekt dzialania czaru 'przeobrazenie' konczy sie, a twoj wyglad powraca do normy.";

class FakeClient {
  private emitter = new EventEmitter();
  private triggers: { pattern: RegExp; callback: (line: any) => any }[] = [];

  Triggers = {
    registerTrigger: (pattern: RegExp, callback: (line: any) => any) => {
      this.triggers.push({ pattern, callback });
    },
  };

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  on(event: string, cb: any) {
    this.emitter.on(event, cb);
    return () => this.emitter.off(event, cb);
  }

  sendEvent(type: string, ...args: any[]) {
    this.emitter.emit(type, ...args);
  }

  /** Feed a line of game output through the registered triggers. */
  line(text: string) {
    this.triggers.filter(t => t.pattern.test(text)).forEach(t => t.callback({ text }));
  }
}

describe('PlayerIdentity', () => {
  let client: FakeClient;
  let identity: PlayerIdentity;
  let nums: (number | undefined)[];
  let resets: number;

  const login = (object_num: number, name = 'Hero') => {
    client.sendEvent('client.connect');
    client.sendEvent('gmcp.char.info', { name, object_num });
  };

  /** A mid-session change of id is judged one macrotask after it arrives. */
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  beforeEach(() => {
    localStorage.clear();
    characterStorage.setCharacter('Hero');
    client = new FakeClient();
    identity = new PlayerIdentity(client as any);
    nums = [];
    resets = 0;
    client.on('player.objectNum', (num?: number) => { nums.push(num); });
    client.on('reset', () => { resets++; });
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('the name it announces', () => {
    const names = () => {
      const seen: string[] = [];
      client.on('player.character', (name: string) => { seen.push(name); });
      return seen;
    };

    test('names the character a login let in', () => {
      const seen = names();
      login(101, 'dargoth');
      expect(seen).toEqual(['dargoth']);
    });

    test('names the second character of a switch over one connection', () => {
      const seen = names();
      login(101, 'dargoth');
      client.sendEvent('gmcp.char.info', { name: 'kethra', object_num: 202 });
      expect(seen).toEqual(['dargoth', 'kethra']);
    });

    test('says nothing for a change of body', async () => {
      // A przeobrazenie must not reach the log looking like a relogin.
      const seen = names();
      login(101, 'dargoth');
      client.line(TRANSFORM_LINE);
      client.sendEvent('gmcp.char.info', { name: 'dargoth', object_num: 512 });
      await settle();
      expect(seen).toEqual(['dargoth']);
    });
  });

  test('publishes the id the session logs in with', () => {
    login(101);
    expect(identity.num).toBe(101);
    expect(identity.sessionNum).toBe(101);
    expect(nums).toEqual([101]);
    expect(resets).toBe(0);
  });

  describe('when the server resends Char.Info for the new body', () => {
    test('adopts the id without calling it a new life', async () => {
      login(101);
      client.line(TRANSFORM_LINE);
      client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 512 });
      await settle();

      expect(identity.num).toBe(512);
      // The session identity - what improveCounter reads as "did I respawn" - holds still.
      expect(identity.sessionNum).toBe(101);
      expect(characterStorage.get('object_num')).toBe('101');
      expect(resets).toBe(0);
      // Briefly nobody, so that state keyed on the body we just left is dropped.
      expect(nums).toEqual([101, undefined, 512]);
    });

    test('order does not matter, the message may follow the frame', async () => {
      login(101);
      client.sendEvent('gmcp.objects.nums', [101, 204, 307]);
      client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 512 });
      client.line(TRANSFORM_LINE);
      await settle();

      expect(identity.num).toBe(512);
      expect(identity.sessionNum).toBe(101);
      expect(resets).toBe(0);
      expect(nums).toEqual([101, 512]);
    });

    test('hands the original id back when the effect lapses', async () => {
      login(101);
      client.line(TRANSFORM_LINE);
      client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 512 });
      await settle();

      client.line(RESTORE_LINE);
      client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 101 });
      await settle();

      expect(identity.num).toBe(101);
      expect(resets).toBe(0);
    });

    // Dying hands out a new id mid-session too, and that one really is a new life.
    test('an unexplained new id is a death and respawn', async () => {
      login(101);
      client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 512 });
      await settle();

      expect(identity.num).toBe(512);
      expect(identity.sessionNum).toBe(512);
      expect(resets).toBe(1);
    });
  });

  describe('when the server says nothing', () => {
    test('works the new id out from the room', () => {
      login(101);
      client.sendEvent('gmcp.objects.nums', [101, 204, 307]);

      client.line(TRANSFORM_LINE);
      // Nobody may act for a body we cannot name.
      expect(identity.num).toBeUndefined();

      client.sendEvent('gmcp.objects.nums', [512, 204, 307]);
      expect(identity.num).toBe(512);
      expect(nums).toEqual([101, undefined, 512]);
      expect(resets).toBe(0);
      // Still the same life, whatever body it is wearing.
      expect(identity.sessionNum).toBe(101);
      expect(characterStorage.get('object_num')).toBe('101');
    });

    test('copes with the object list arriving before the message', () => {
      login(101);
      client.sendEvent('gmcp.objects.nums', [101, 204, 307]);
      client.sendEvent('gmcp.objects.nums', [512, 204, 307]);

      client.line(TRANSFORM_LINE);
      expect(identity.num).toBe(512);
    });

    test('gives the original id back when the effect lapses', () => {
      login(101);
      client.sendEvent('gmcp.objects.nums', [101, 204, 307]);
      client.line(TRANSFORM_LINE);
      client.sendEvent('gmcp.objects.nums', [512, 204, 307]);
      expect(identity.num).toBe(512);

      client.sendEvent('gmcp.objects.nums', [101, 204, 307]);
      client.line(RESTORE_LINE);
      expect(identity.num).toBe(101);
    });

    test('stays unknown rather than guess when the room moved too', () => {
      login(101);
      client.sendEvent('gmcp.objects.nums', [101, 204, 307]);
      client.line(TRANSFORM_LINE);

      // Two strangers where one was expected - no way to tell which is us.
      client.sendEvent('gmcp.objects.nums', [512, 666, 204, 307]);
      expect(identity.num).toBeUndefined();
    });

    test('keeps the id when it turns out not to have moved', () => {
      login(101);
      client.sendEvent('gmcp.objects.nums', [101, 204, 307]);
      client.line(TRANSFORM_LINE);

      client.sendEvent('gmcp.objects.nums', [101, 204, 307]);
      expect(identity.num).toBe(101);
    });
  });

  // The proxy resumes the telnet session a dropped socket was attached to, and
  // Char.Info is only pushed when one is opened - so there is nothing to restore the
  // id from afterwards. Forgetting it here left the player listed among the strangers
  // in the room, with a numbered attack shortcut on their own object.
  test('keeps the id across a dropped socket, since the session resumes', () => {
    login(101);
    client.sendEvent('client.disconnect');
    expect(identity.num).toBe(101);
    expect(identity.sessionNum).toBe(101);

    client.sendEvent('client.connect');
    client.sendEvent('gmcp.objects.nums', [101, 204]);
    expect(identity.num).toBe(101);
    expect(nums).toEqual([101]);
    expect(resets).toBe(0);
  });

  // The proxy hands back a session this client was already in. Char.Info is sent when
  // a session opens, not when a client reattaches to one, so nothing in what follows
  // announces who we are - and nothing in it is a login either.
  describe('when the proxy resumes the session', () => {
    const resume = () => {
      client.sendEvent('client.connect');
      client.sendEvent('proxy.session', { type: 'session', resumed: true });
    };

    test('a change of body afterwards is not read as a new life', async () => {
      login(101);
      client.sendEvent('client.disconnect');
      resume();

      client.line(TRANSFORM_LINE);
      client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 512 });
      await settle();

      expect(identity.num).toBe(512);
      expect(identity.sessionNum).toBe(101);
      expect(characterStorage.get('object_num')).toBe('101');
      // Reading the reattach as a login wiped the chat history and the combat stats.
      expect(resets).toBe(0);
    });

    test('a death afterwards is still a death', async () => {
      login(101);
      client.sendEvent('client.disconnect');
      resume();

      client.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 512 });
      await settle();

      expect(identity.sessionNum).toBe(512);
      expect(resets).toBe(1);
    });

    // A page reload leaves nothing in memory to keep, so the id storage wrote down
    // when this life opened is taken back up instead. Reloading means a client that
    // has never seen a Char.Info, which is what the fresh instance stands in for.
    describe('after a page reload', () => {
      let reloaded: PlayerIdentity;
      let reloadedClient: FakeClient;
      let reloadResets: number;

      beforeEach(() => {
        characterStorage.set('object_num', '101');
        reloadedClient = new FakeClient();
        reloaded = new PlayerIdentity(reloadedClient as any);
        reloadResets = 0;
        reloadedClient.on('reset', () => { reloadResets++; });
        reloadedClient.sendEvent('client.connect');
      });

      test('recovers the id from storage once the room confirms it', () => {
        reloadedClient.sendEvent('proxy.session', { type: 'session', resumed: true });
        expect(reloaded.num).toBeUndefined();

        reloadedClient.sendEvent('gmcp.objects.nums', [101, 204]);
        expect(reloaded.num).toBe(101);
        expect(reloaded.sessionNum).toBe(101);
        expect(reloadResets).toBe(0);
      });

      // Resumed mid-przeobrazenie: storage holds the id of the body we are not
      // wearing, and our own object is always among the room's - so it stays a
      // candidate rather than being adopted.
      test('does not adopt a stored id the room does not have', () => {
        reloadedClient.sendEvent('proxy.session', { type: 'session', resumed: true });
        reloadedClient.sendEvent('gmcp.objects.nums', [512, 204]);
        expect(reloaded.num).toBeUndefined();

        // It comes back when the effect lapses, and is adopted then.
        reloadedClient.sendEvent('gmcp.objects.nums', [101, 204]);
        expect(reloaded.num).toBe(101);
      });

      test('leaves an attach that is not a resume alone', () => {
        reloadedClient.sendEvent('gmcp.objects.nums', [101, 204]);
        expect(reloaded.num).toBeUndefined();

        reloadedClient.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 333 });
        expect(reloaded.num).toBe(333);
        expect(reloaded.sessionNum).toBe(333);
        expect(reloadResets).toBe(1);
      });

      // The game ended the session while nobody was attached; what the proxy is
      // handing over is its parting words, not a world to stand in.
      test('does not resume into a session the game has closed', () => {
        reloadedClient.sendEvent('proxy.session', {
          type: 'session', resumed: true, upstreamClosed: true,
        });
        reloadedClient.sendEvent('gmcp.objects.nums', [101, 204]);
        expect(reloaded.num).toBeUndefined();

        // And the next Char.Info is the login it looks like.
        reloadedClient.sendEvent('gmcp.char.info', { name: 'Hero', object_num: 333 });
        expect(reloaded.sessionNum).toBe(333);
        expect(reloadResets).toBe(1);
      });
    });
  });

  test('a reconnect that really is a new login still starts a new life', () => {
    login(101);
    client.sendEvent('client.disconnect');
    login(333);

    expect(identity.num).toBe(333);
    expect(identity.sessionNum).toBe(333);
    expect(characterStorage.get('object_num')).toBe('333');
    expect(resets).toBe(1);
  });

  test('a reconnect with a new id is a new session', () => {
    login(101);
    login(202);
    expect(resets).toBe(1);
    expect(identity.sessionNum).toBe(202);
    expect(characterStorage.get('object_num')).toBe('202');
  });
});
