import initUserAliases from '@client/scripts/userAliases';
import { FakeClient, initHerbClient, defaultHerbData } from '../helpers/herbClient';
import { globalStorage, characterStorage } from '@modules/core/storage';

class AliasClient extends FakeClient {
  executed: string[] = [];
  output: string[] = [];
  private pending: Promise<void>[] = [];

  constructor() {
    super();
    this.sendCommand = jest.fn((command: string) => {
      const promise = this.process(command);
      this.pending.push(promise);
      return promise;
    });
  }

  private async process(command: string): Promise<void> {
    if (!command) {
      return;
    }

    const parts = command.split(/[#;]/);
    if (parts.length > 1) {
      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed) {
          await this.process(trimmed);
        }
      }
      return;
    }

    const aliasEntry = this.aliases.find((entry) => entry.pattern.test(command));
    if (aliasEntry) {
      const match = command.match(aliasEntry.pattern);
      if (match) {
        const result = aliasEntry.callback(match as RegExpMatchArray);
        if (result && typeof (result as Promise<unknown>).then === 'function') {
          await result;
        }
      }
      return;
    }

    this.executed.push(command);
    this.output.push(command);
  }

  async flush(): Promise<void> {
    const current = this.pending;
    this.pending = [];
    await Promise.all(current);
  }
}

describe('user aliases', () => {
  afterEach(() => {
    localStorage.clear();
  });

  test('executes herb taking commands before final action', async () => {
    characterStorage.setCharacter('TestChar');
    const client = new AliasClient();
    const herbData = {
      ...defaultHerbData,
      herb_id_to_odmiana: {
        ...defaultHerbData.herb_id_to_odmiana,
        naparstnica: {
          mianownik: 'naparstnica',
          dopelniacz: 'naparstnicy',
          biernik: 'naparstnice',
          mnoga_mianownik: 'naparstnice',
          mnoga_dopelniacz: 'naparstnic',
          mnoga_biernik: 'naparstnice',
        },
      },
    };

    initHerbClient(client, { 1: { naparstnica: 1, deliona: 1 } }, herbData);
    initUserAliases((client as unknown) as any, client.aliases);

    globalStorage.set('aliases', [
      {
        pattern: '/zm1',
        command: '/wezz naparstnica;/wezz deliona;ob delione;zjedz ziola',
      },
    ] as any);

    const alias = client.aliases.find((entry) => entry.pattern.test('/zm1'));
    expect(alias).toBeTruthy();

    const match = '/zm1'.match(alias!.pattern) as RegExpMatchArray;
    await alias!.callback(match);
    await client.flush();

    const expectedSequence = [
      'otworz 1. swoj woreczek',
      'wez 1 naparstnice z 1. swojego woreczka',
      'zamknij 1. swoj woreczek',
      'otworz 1. swoj woreczek',
      'wez 1 zolty jasny kwiat z 1. swojego woreczka',
      'zamknij 1. swoj woreczek',
      'ob delione',
      'zjedz ziola',
    ];

    expect(client.executed).toEqual(expectedSequence);
    expect(client.output).toEqual(expectedSequence);
  });

  describe('range expansion with $i', () => {
    function setupRangeClient() {
      const client = new AliasClient();
      initUserAliases((client as unknown) as any, client.aliases);
      return client;
    }

    test('expands ascending range 1-3', async () => {
      const client = setupRangeClient();
      globalStorage.set('aliases', [
        { pattern: 'kok (.+)', command: 'rozerwij $i. kokon' },
      ] as any);

      const alias = client.aliases.find((e) => e.pattern.test('kok 1-3'));
      expect(alias).toBeTruthy();
      const match = 'kok 1-3'.match(alias!.pattern) as RegExpMatchArray;
      await alias!.callback(match);
      await client.flush();

      expect(client.executed).toEqual([
        'rozerwij 1. kokon',
        'rozerwij 2. kokon',
        'rozerwij 3. kokon',
      ]);
    });

    test('expands descending range 3-1', async () => {
      const client = setupRangeClient();
      globalStorage.set('aliases', [
        { pattern: 'kok (.+)', command: 'rozerwij $i. kokon' },
      ] as any);

      const alias = client.aliases.find((e) => e.pattern.test('kok 3-1'));
      const match = 'kok 3-1'.match(alias!.pattern) as RegExpMatchArray;
      await alias!.callback(match);
      await client.flush();

      expect(client.executed).toEqual([
        'rozerwij 3. kokon',
        'rozerwij 2. kokon',
        'rozerwij 1. kokon',
      ]);
    });

    test('single number sends one command', async () => {
      const client = setupRangeClient();
      globalStorage.set('aliases', [
        { pattern: 'kok (.+)', command: 'rozerwij $i. kokon' },
      ] as any);

      const alias = client.aliases.find((e) => e.pattern.test('kok 5'));
      const match = 'kok 5'.match(alias!.pattern) as RegExpMatchArray;
      await alias!.callback(match);
      await client.flush();

      expect(client.executed).toEqual(['rozerwij 5. kokon']);
    });

    test('$i combined with $1 in same command', async () => {
      const client = setupRangeClient();
      globalStorage.set('aliases', [
        { pattern: 'kok (\\d+-?\\d*) (.+)', command: 'rozerwij $i. $2 (zakres $1)' },
      ] as any);

      const alias = client.aliases.find((e) => e.pattern.test('kok 1-2 kokon'));
      const match = 'kok 1-2 kokon'.match(alias!.pattern) as RegExpMatchArray;
      await alias!.callback(match);
      await client.flush();

      expect(client.executed).toEqual([
        'rozerwij 1. kokon (zakres 1-2)',
        'rozerwij 2. kokon (zakres 1-2)',
      ]);
    });

    test('caps range at 50 iterations', async () => {
      const client = setupRangeClient();
      globalStorage.set('aliases', [
        { pattern: 'kok (.+)', command: 'rozerwij $i. kokon' },
      ] as any);

      const alias = client.aliases.find((e) => e.pattern.test('kok 1-100'));
      const match = 'kok 1-100'.match(alias!.pattern) as RegExpMatchArray;
      await alias!.callback(match);
      await client.flush();

      expect(client.executed).toHaveLength(50);
      expect(client.executed[0]).toBe('rozerwij 1. kokon');
      expect(client.executed[49]).toBe('rozerwij 50. kokon');
    });

    test('no $i in command preserves original behavior', async () => {
      const client = setupRangeClient();
      globalStorage.set('aliases', [
        { pattern: 'zab (.+)', command: 'zabij $1' },
      ] as any);

      const alias = client.aliases.find((e) => e.pattern.test('zab goblin'));
      const match = 'zab goblin'.match(alias!.pattern) as RegExpMatchArray;
      await alias!.callback(match);
      await client.flush();

      expect(client.executed).toEqual(['zabij goblin']);
    });

    test('character override with $i', async () => {
      characterStorage.setCharacter('Warrior');
      const client = setupRangeClient();
      globalStorage.set('aliases', [
        {
          pattern: 'kok (.+)',
          command: 'rozerwij $i. kokon',
          overrides: { Warrior: 'rozbij $i. kokon' },
        },
      ] as any);

      const alias = client.aliases.find((e) => e.pattern.test('kok 1-2'));
      const match = 'kok 1-2'.match(alias!.pattern) as RegExpMatchArray;
      await alias!.callback(match);
      await client.flush();

      expect(client.executed).toEqual([
        'rozbij 1. kokon',
        'rozbij 2. kokon',
      ]);
    });

    test('newlines in command treated as separators', async () => {
      const client = setupRangeClient();
      globalStorage.set('aliases', [
        { pattern: 'prep (.+)', command: 'pierwsza $1\ndruga $1' },
      ] as any);

      const alias = client.aliases.find((e) => e.pattern.test('prep cos'));
      const match = 'prep cos'.match(alias!.pattern) as RegExpMatchArray;
      await alias!.callback(match);
      await client.flush();

      expect(client.executed).toEqual(['pierwsza cos', 'druga cos']);
    });

    test('newlines with $i range', async () => {
      const client = setupRangeClient();
      globalStorage.set('aliases', [
        { pattern: 'multi (.+)', command: 'wez $i. rzecz\nschowaj $i. rzecz' },
      ] as any);

      const alias = client.aliases.find((e) => e.pattern.test('multi 1-2'));
      const match = 'multi 1-2'.match(alias!.pattern) as RegExpMatchArray;
      await alias!.callback(match);
      await client.flush();

      expect(client.executed).toEqual([
        'wez 1. rzecz',
        'schowaj 1. rzecz',
        'wez 2. rzecz',
        'schowaj 2. rzecz',
      ]);
    });
  });
});
