import fs from 'fs';
import path from 'path';
import type {CDPSession} from '@playwright/test';
import {test} from '../support/fixtures';
import {ensureGameSocket, primeCharInfo, waitForCommandInput} from '../support/mocks';

/**
 * How much main-thread time one line of game output costs, end to end: telnet/GMCP
 * decoding, the trigger pass, DOM rendering and whatever the line sets off in the
 * UI afterwards (React popups, the footer, loggers).
 *
 * Run with `yarn perf`. Per scenario it prints the synchronous cost per line, frame
 * times and Chromium's own main-thread totals, then the functions with the most
 * self time. The full CPU profile lands in `perf-results/` - open it in DevTools
 * (Performance panel > Load profile) to dig into a hotspot.
 *
 * Numbers are only comparable between runs on the same machine: compare a branch
 * against its base, not against figures someone else posted.
 *
 * The corpus is game lines lifted from the unit and e2e tests, so it leans towards
 * lines some trigger reacts to - a pessimistic mix, which is what a budget wants.
 */

const OUT_DIR = path.resolve('perf-results');
const CORPUS = fs.readFileSync(new URL('./corpus.txt', import.meta.url), 'utf8').split('\n').filter(Boolean);
const TYPES = ['comm', 'room.short', 'other', 'combat.avatar', 'room.contents.object'];

const SCENARIOS = [
    // A busy fight: a few lines every frame, for a while.
    {name: 'steady', lines: 4000, perFrame: 10},
    // A burst the server sends in one go (logging in, a long listing).
    {name: 'burst', lines: 4000, perFrame: 200},
];

type Metrics = Record<string, number>;

async function metrics(cdp: CDPSession): Promise<Metrics> {
    const {metrics} = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(metrics.map(m => [m.name, m.value]));
}

/** Functions by self time, the first place to look in a profile. */
function topSelfTime(profile: any, limit: number): string[] {
    const self = new Map<number, number>();
    profile.samples.forEach((id: number, i: number) => {
        self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i + 1] ?? 0));
    });
    const byFunction = new Map<string, number>();
    for (const node of profile.nodes) {
        const {functionName, url, lineNumber} = node.callFrame;
        const key = `${functionName || '(anonymous)'} ${url.split('/').pop()}:${lineNumber + 1}`;
        byFunction.set(key, (byFunction.get(key) ?? 0) + (self.get(node.id) ?? 0));
    }
    return [...byFunction.entries()]
        .filter(([key]) => !key.startsWith('(idle)'))
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([key, us]) => `${(us / 1000).toFixed(1).padStart(8)} ms  ${key}`);
}

test('line throughput', async ({page}) => {
    await page.goto('/');
    await waitForCommandInput(page);
    await ensureGameSocket(page);
    await primeCharInfo(page, {name: 'Tester'});

    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', {interval: 100});
    fs.mkdirSync(OUT_DIR, {recursive: true});

    const run = (lines: number, perFrame: number) => page.evaluate(async ({corpus, types, lines, perFrame}) => {
        const pushGmcp = (window as any).__pushGmcp;
        const frames: number[] = [];
        const pushes: number[] = [];
        const start = performance.now();
        let last = start;
        for (let sent = 0, batch = 0; sent < lines; batch++) {
            await new Promise(resolve => requestAnimationFrame(resolve));
            const now = performance.now();
            frames.push(now - last);
            last = now;
            let chunk = '';
            for (let k = 0; k < perFrame && sent < lines; k++, sent++) {
                // A stride through the corpus, so neighbouring lines differ.
                chunk += corpus[(sent * 7919) % corpus.length] + '\n';
            }
            const t0 = performance.now();
            pushGmcp('gmcp_msgs', {type: types[batch % types.length], text: btoa(chunk)});
            pushes.push(performance.now() - t0);
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
        const pct = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.floor(values.length * p)];
        const pushTotal = pushes.reduce((a, b) => a + b, 0);
        return {
            elapsedMs: performance.now() - start,
            syncPerLineUs: pushTotal / lines * 1000,
            pushP95Ms: pct(pushes, 0.95),
            frameP50Ms: pct(frames, 0.5),
            frameP95Ms: pct(frames, 0.95),
            frameMaxMs: Math.max(...frames),
            domNodes: document.getElementsByTagName('*').length,
        };
    }, {corpus: CORPUS, types: TYPES, lines, perFrame});

    // Warm the JIT and fill the scrollback to its cap before measuring anything.
    await run(1500, 10);

    for (const scenario of SCENARIOS) {
        const before = await metrics(cdp);
        await cdp.send('Profiler.start');
        const result = await run(scenario.lines, scenario.perFrame);
        const {profile} = await cdp.send('Profiler.stop');
        const after = await metrics(cdp);
        const delta = (name: string) => after[name] - before[name];

        const file = path.join(OUT_DIR, `${scenario.name}.cpuprofile`);
        fs.writeFileSync(file, JSON.stringify(profile));

        const f = (n: number, digits = 1) => n.toFixed(digits);
        console.log([
            ``,
            `== ${scenario.name}: ${scenario.lines} lines, ${scenario.perFrame} per frame ==`,
            `sync cost per line   ${f(result.syncPerLineUs, 0)} us   (p95 per push ${f(result.pushP95Ms)} ms)`,
            `frames               p50 ${f(result.frameP50Ms)} ms  p95 ${f(result.frameP95Ms)} ms  max ${f(result.frameMaxMs)} ms`,
            `main thread          ${f(delta('TaskDuration'), 2)} s busy of ${f(result.elapsedMs / 1000, 2)} s` +
            `  (script ${f(delta('ScriptDuration'), 2)} s, layout ${f(delta('LayoutDuration'), 2)} s / ${delta('LayoutCount')}x,` +
            ` style ${f(delta('RecalcStyleDuration'), 2)} s)`,
            `DOM nodes            ${result.domNodes}`,
            `top self time (${path.relative(process.cwd(), file)}):`,
            ...topSelfTime(profile, 15),
        ].join('\n'));
    }
});
