import { vi } from 'vitest';
import initUserScripts, { isModuleScript, runUserScript, scriptLoader, toModuleSource } from '@client/scripts/userScripts';
import initUserTriggers from '@client/scripts/userTriggers';
import Triggers from '@client/Triggers';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import { characterStorage, globalStorage } from '@modules/core/storage';
import { getAutomationGroups } from '@modules/core/automation';
import { clearScriptLog, getScriptLog } from '@modules/core/scriptConsole';

const cleanups: ReturnType<typeof vi.fn>[] = [];

// The real plugin API wants a whole client; a script only needs to see that it
// got one, and that sending goes through it.
vi.mock('@client/PluginApi', () => ({
    PluginApiImpl: class {
        command = { send: vi.fn(async () => {}) };
        output = { print: vi.fn() };
        cleanup = vi.fn();
        constructor() {
            cleanups.push(this.cleanup);
        }
    },
}));

// Blob modules cannot be imported under jsdom: the body runs as a function of (api, args, ctx).
scriptLoader.compile = async (code: string) => new Function('api', 'args', 'ctx', code) as never;

class FakeClient {
    aliases: { pattern: RegExp; callback: Function }[] = [];
    Triggers = new Triggers(({} as unknown) as any);
    sendCommand = vi.fn();
    sendEvent = vi.fn();
    on = vi.fn();
    off = vi.fn();
    FunctionalBind = { set: vi.fn() };
}

const log = (id: string) => getScriptLog(id).map(e => `${e.kind}: ${e.text}`);

function setScripts(scripts: unknown[]) {
    globalStorage.set('automationScripts', scripts as never);
}

describe('userScripts', () => {
    afterEach(() => {
        localStorage.clear();
        ['s1', 's2'].forEach(clearScriptLog);
    });

    it('runs with the args and logs what it did', async () => {
        const client = new FakeClient();
        setScripts([{ id: 's1', name: 'leczenie', code: "ctx.log('hp', args[0]); api.command.send('wypij mikstur');" }]);

        await runUserScript(client as never, 's1', ['3'], { source: 'trigger', label: '^Jestes ranny' });

        expect(log('s1')).toEqual([
            'run: uruchomiony przez ^Jestes ranny (3)',
            'log: hp 3',
            'send: wypij mikstur',
        ]);
    });

    it('puts an error in the console instead of throwing', async () => {
        const client = new FakeClient();
        setScripts([{ id: 's1', name: 'x', code: "throw new Error('brak mikstur')" }]);

        await expect(runUserScript(client as never, 's1', [], { source: 'manual' })).resolves.toBeUndefined();
        expect(log('s1').at(-1)).toBe('error: blad: brak mikstur');
    });

    it('skips a switched off script unless forced from the editor', async () => {
        const client = new FakeClient();
        setScripts([{ id: 's1', name: 'x', enabled: false, code: "ctx.log('ran')" }]);

        await runUserScript(client as never, 's1', [], { source: 'alias', label: 'lecz' });
        expect(log('s1')).toEqual(['run: pominiety (wylaczony) - lecz']);

        await runUserScript(client as never, 's1', [], { source: 'manual', force: true, code: "ctx.log('draft')" });
        expect(log('s1').at(-1)).toBe('log: draft');
    });

    it('runs through its own command, with the words as args', async () => {
        characterStorage.setCharacter('Arel');
        const client = new FakeClient();
        initUserScripts(client as never, client.aliases);
        setScripts([{ id: 's1', name: 'x', command: 'leczenie', code: "ctx.log(args.join('+'))" }]);

        const alias = client.aliases.find(a => a.pattern.test('/leczenie goblin ork'))!;
        alias.callback('/leczenie goblin ork'.match(alias.pattern));
        await vi.waitFor(() => expect(log('s1').at(-1)).toBe('log: goblin+ork'));
        expect(client.aliases.some(a => a.pattern.test('/leczeniex'))).toBe(false);
    });

    it('drops the compiled code and registrations of a changed script', async () => {
        const client = new FakeClient();
        initUserScripts(client as never, client.aliases);
        setScripts([{ id: 's2', name: 'x', code: "ctx.log('v1')" }]);
        await runUserScript(client as never, 's2', [], { source: 'manual' });
        const cleanup = cleanups.at(-1)!;

        setScripts([{ id: 's2', name: 'x', code: "ctx.log('v2')" }]);
        expect(cleanup).toHaveBeenCalled();
        await runUserScript(client as never, 's2', [], { source: 'manual' });
        expect(log('s2').at(-1)).toBe('log: v2');
    });

    it('shares vars between scripts', async () => {
        const client = new FakeClient();
        setScripts([
            { id: 's1', name: 'zapamietaj', code: "ctx.vars.cel = args[0];" },
            { id: 's2', name: 'atakuj', code: "ctx.log('zabij', ctx.vars.cel);" },
        ]);

        await runUserScript(client as never, 's1', ['goblin'], { source: 'alias', label: '1 (.*)' });
        await runUserScript(client as never, 's2', [], { source: 'alias', label: '1' });

        expect(log('s2')).toContain('log: zabij goblin');
    });

    describe('module source', () => {
        /** Runs a wrapped body the way the module would, without importing a blob. */
        async function runBody(body: string, api: Record<string, unknown>) {
            const source = toModuleSource(body).replace(/^export default /, 'return ');
            const fn = new Function(source)() as (api: unknown, args: string[], ctx: unknown) => Promise<unknown>;
            return fn(api, ['goblin'], { log: () => {}, vars: {} });
        }

        it('puts the body on line 2, inside the scope line', () => {
            const lines = toModuleSource("send('x');\nreturn 1;").split('\n');
            expect(lines[0]).toMatch(/^export default async function \(api, args, ctx\) \{ const \{ triggers, aliases, /);
            expect(lines[0]).toContain('gmcp = api.gmcp.get();');
            expect(lines[0]).toContain('const vars = ctx.vars,');
            expect(lines[1]).toBe("send('x');");
        });

        it('has the API sections by name, and lets the body shadow them', async () => {
            const sent: string[] = [];
            const api = {
                command: { send: async (c: string) => { sent.push(c); } },
                output: { print: () => {} },
                gmcp: { get: () => ({ char: { state: { hp: 2 } } }) },
                map: { name: 'mapa' },
            };
            const result = await runBody(
                "await command.send('zabij ' + args[0]);\nconst hp = gmcp.char.state.hp;\nconst map = new Map([[1, api.map.name]]);\nreturn [hp, map.get(1)];",
                api,
            );
            expect(sent).toEqual(['zabij goblin']);
            // The body's own `map` shadows the section instead of clashing with it.
            expect(result).toEqual([2, 'mapa']);
        });

        it('leaves a module as it is', () => {
            const module = "import confetti from 'https://esm.sh/canvas-confetti';\nexport default function () {}";
            expect(isModuleScript(module)).toBe(true);
            expect(toModuleSource(module)).toBe(module);
            expect(isModuleScript("const lib = await import('https://esm.sh/x');")).toBe(false);
        });
    });

    describe('actions', () => {
        it('a trigger runs a script with its groups and switches a group', async () => {
            const client = new FakeClient();
            initUserTriggers(client as never);
            setScripts([{ id: 's1', name: 'x', code: "ctx.log(ctx.source, args[0], ctx.line)" }]);
            globalStorage.set('automationGroups', [{ id: 'g', name: 'Walka' }]);
            globalStorage.set('triggers', [{
                pattern: '^(\\w+) atakuje cie',
                macros: [
                    { type: 'script', scriptId: 's1' },
                    { type: 'group', groupId: 'g', groupState: 'off' },
                ],
            }]);

            client.Triggers.parseLine(new AnsiAwareBuffer('Goblin atakuje cie!'), '');

            await vi.waitFor(() => expect(log('s1').at(-1)).toBe('log: trigger Goblin Goblin atakuje cie!'));
            expect(getAutomationGroups()[0].enabled).toBe(false);
        });
    });
});
