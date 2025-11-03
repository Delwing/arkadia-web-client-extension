import initUserAliases from '@client/scripts/userAliases';
import { FakeClient, initHerbClient, defaultHerbData } from './helpers/herbClient';

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
  test('executes herb taking commands before final action', async () => {
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

    client.dispatch('storage', {
      key: 'aliases',
      value: [
        {
          pattern: '/zm1',
          command: '/wezz naparstnica;/wezz deliona;ob delione;zjedz ziola',
        },
      ],
    });

    const alias = client.aliases.find((entry) => entry.pattern.test('/zm1'));
    expect(alias).toBeTruthy();

    const match = '/zm1'.match(alias!.pattern) as RegExpMatchArray;
    await alias!.callback(match);
    await client.flush();

    const expectedSequence = [
      'otworz 1. swoj woreczek',
      'wez naparstnice z 1. swojego woreczka',
      'zamknij 1. swoj woreczek',
      'otworz 1. swoj woreczek',
      'wez zolty jasny kwiat z 1. swojego woreczka',
      'zamknij 1. swoj woreczek',
      'ob delione',
      'zjedz ziola',
    ];

    expect(client.executed).toEqual(expectedSequence);
    expect(client.output).toEqual(expectedSequence);
  });
});
