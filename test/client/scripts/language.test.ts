import initLanguage from '@client/scripts/language';
import { setTestSettings } from '../helpers/testSettings';

type ListenerMap = Record<string, Array<(event: any) => void>>;

import { createRootScope } from '@client/ScriptScope';

type AliasEntry = {
  pattern: RegExp;
  callback: (matches: RegExpMatchArray) => void;
};

type MockedClient = {
  scope: ReturnType<typeof createRootScope>;
  send: jest.Mock;
  sendCommand: jest.Mock;
  aliases: AliasEntry[];
  clientAdapter: {
    output: jest.Mock;
    flushMessageBuffer: jest.Mock;
    shouldEchoCommand: jest.Mock;
  };
  port: {
    postMessage: jest.Mock;
  };
  on: jest.Mock;
  Triggers: {
    registerOneTimeTrigger: jest.Mock;
  };
};

type ClientTestContext = {
  client: MockedClient;
  dispatch: (event: string, detail: any) => void;
  triggerAlias: (input: string) => void;
  sendMock: jest.Mock;
  sendCommandMock: jest.Mock;
  outputMock: jest.Mock;
  flushMock: jest.Mock;
  postMessageMock: jest.Mock;
};

function createMockClient(): ClientTestContext {
  const listeners: ListenerMap = {};

  const sendMock = jest.fn();
  const sendCommandMock = jest.fn();
  const outputMock = jest.fn();
  const flushMock = jest.fn();
  const postMessageMock = jest.fn();

  const client: MockedClient = {
    scope: createRootScope('test'),
    send: sendMock,
    sendCommand: sendCommandMock,
    aliases: [],
    clientAdapter: {
      output: outputMock,
      flushMessageBuffer: flushMock,
      shouldEchoCommand: jest.fn(() => true),
    },
    port: {
      postMessage: postMessageMock,
    },
    Triggers: {
      registerOneTimeTrigger: jest.fn(),
    },
    on: jest.fn((event: string, callback: (ev: any) => void) => {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event]!.push(callback);
      return () => {
        listeners[event] = (listeners[event] || []).filter(cb => cb !== callback);
      };
    }),
  };

  const dispatch = (event: string, detail: any) => {
    listeners[event]?.forEach((callback) => callback(detail));
  };

  const triggerAlias = (input: string) => {
    const aliasEntry = client.aliases.find(({ pattern }) => pattern.test(input));
    expect(aliasEntry).toBeDefined();
    const matches = input.match(aliasEntry!.pattern);
    expect(matches).not.toBeNull();
    aliasEntry!.callback(matches as RegExpMatchArray);
  };

  return {
    client,
    dispatch,
    triggerAlias,
    sendMock,
    sendCommandMock,
    outputMock,
    flushMock,
    postMessageMock,
  };
}

describe('language speech handling', () => {
  test('single quote speech sends plain quote when message empty', () => {
    const context = createMockClient();

    initLanguage(context.client as any, context.client.aliases);

    setTestSettings({
      language: 'elficki',
      languageAdjective: 'smoothly',
      languageAliases: [],
    });

    context.triggerAlias("'");

    expect(context.sendMock).toHaveBeenCalledWith("'", false);
    expect(context.sendCommandMock).not.toHaveBeenCalled();
    expect(context.outputMock).toHaveBeenCalledWith("→ '", 'command');
    expect(context.flushMock).toHaveBeenCalled();
  });

  test('single quote speech sends casual language without adjective via send', () => {
    const context = createMockClient();

    initLanguage(context.client as any, context.client.aliases);

    setTestSettings({
      language: 'potoczna',
      languageAdjective: '',
      languageAliases: [],
    });

    context.triggerAlias("'hello there");

    expect(context.sendMock).toHaveBeenCalledWith("'hello there", false);
    expect(context.sendCommandMock).not.toHaveBeenCalled();
    expect(context.outputMock).toHaveBeenCalledWith("→ 'hello there", 'command');
    expect(context.flushMock).toHaveBeenCalled();
  });

  test('single quote speech uses adjective for casual language commands', () => {
    const context = createMockClient();

    initLanguage(context.client as any, context.client.aliases);

    setTestSettings({
      language: 'potoczna',
      languageAdjective: 'warmly',
      languageAliases: [],
    });

    context.triggerAlias("'good day");

    expect(context.sendMock).not.toHaveBeenCalled();
    expect(context.sendCommandMock).toHaveBeenCalledWith('ppowiedz warmly good day', false);
    expect(context.outputMock).toHaveBeenCalledWith("→ 'good day", 'command');
    expect(context.flushMock).toHaveBeenCalled();
  });

  test('single quote speech issues language commands for non casual language', () => {
    const context = createMockClient();

    initLanguage(context.client as any, context.client.aliases);

    setTestSettings({
      language: 'elficki',
      languageAdjective: '',
      languageAliases: [],
    });

    context.triggerAlias("'welcome heroes");

    expect(context.sendMock).not.toHaveBeenCalled();
    expect(context.sendCommandMock.mock.calls).toEqual([
      ['justaw elficki', false],
      ['jppowiedz welcome heroes', false],
    ]);
    expect(context.outputMock).toHaveBeenCalledWith("→ 'welcome heroes", 'command');
    expect(context.flushMock).toHaveBeenCalled();
  });

  test('custom language alias switches and restores language', () => {
    const context = createMockClient();

    initLanguage(context.client as any, context.client.aliases);

    setTestSettings({
      language: 'norski',
      languageAdjective: 'gruffly',
      languageAliases: [
        {
          alias: 'sayelf',
          adjective: 'softly',
          language: 'elficki',
        },
      ],
    });

    context.triggerAlias('sayelf greetings travelers');

    expect(context.sendMock).not.toHaveBeenCalled();
    expect(context.sendCommandMock.mock.calls).toEqual([
      ['justaw elficki', false],
      ['jppowiedz softly greetings travelers', false],
      ['justaw norski', false],
    ]);
    expect(context.outputMock).toHaveBeenCalledWith("→ 'greetings travelers", 'command');
    expect(context.flushMock).toHaveBeenCalled();
  });

  test('custom alias requires space before text', () => {
    const context = createMockClient();

    initLanguage(context.client as any, context.client.aliases);

    setTestSettings({
      language: 'potoczna',
      languageAdjective: '',
      languageAliases: [
        {
          alias: 'jp',
          adjective: '',
          language: 'khazalid',
        },
      ],
    });

    // 'jp hello' should match
    const aliasWithSpace = context.client.aliases.find(({ pattern }) => pattern.test('jp hello'));
    expect(aliasWithSpace).toBeDefined();

    // 'jp' alone should match
    const aliasAlone = context.client.aliases.find(({ pattern }) => pattern.test('jp'));
    expect(aliasAlone).toBeDefined();

    // 'jphello' should NOT match the jp alias
    const aliasNoSpace = context.client.aliases.find(({ pattern }) => pattern.test('jphello'));
    expect(aliasNoSpace).toBeUndefined();

    // 'jppowiedz' should NOT match the jp alias
    const jpCommand = context.client.aliases.find(({ pattern }) => pattern.test('jppowiedz'));
    expect(jpCommand).toBeUndefined();
  });

  test('custom alias without text sends empty message', () => {
    const context = createMockClient();

    initLanguage(context.client as any, context.client.aliases);

    setTestSettings({
      language: 'potoczna',
      languageAdjective: '',
      languageAliases: [
        {
          alias: 'jp',
          adjective: '',
          language: 'khazalid',
        },
      ],
    });

    context.triggerAlias('jp');

    expect(context.sendMock).toHaveBeenCalledWith("'", false);
    expect(context.outputMock).toHaveBeenCalledWith("→ '", 'command');
  });

  test('double quote does not trigger language alias', () => {
    const context = createMockClient();

    initLanguage(context.client as any, context.client.aliases);

    setTestSettings({
      language: 'elficki',
      languageAdjective: '',
      languageAliases: [],
    });

    // Double quote should NOT match language alias - should be sent directly to game
    const matchingAlias = context.client.aliases.find(({ pattern }) => pattern.test("''wesolo Cos"));
    expect(matchingAlias).toBeUndefined();
  });
});
