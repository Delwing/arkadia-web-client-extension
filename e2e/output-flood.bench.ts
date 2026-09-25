import { test } from './support/fixtures';
import { ensureGameSocket, waitForCommandInput } from './support/mocks';
import type { CDPSession, Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

/**
 * Game output under a line flood: the stock output vs forge's GameLog.
 *
 * Both shells run on the same page (`/` and `/?ui=forge`), the same client and
 * the same shared output engine (setupOutputMessageHandler); what differs is
 * the per-line DOM each builds, its line cap and the CSS it is painted with.
 * Lines go in as raw socket frames, so each one takes the full path: telnet
 * parsing, triggers, ANSI, render.
 *
 * Run: `yarn build && yarn bench:output` (writes test-results/output-bench.json).
 * Set BENCH_CPU=4 to also run under 4x CPU throttling.
 */

type Shell = 'stock' | 'forge';

interface FloodResult {
    lines: number;
    /** Wall time of handling the socket frames (sync JS: parse, triggers, render). */
    handleMs: number;
    /** From the first frame to the next painted frame after the last one. */
    toPaintMs: number;
    frames: number;
    avgFrameMs: number;
    p95FrameMs: number;
    maxFrameMs: number;
    /** Frames longer than 50 ms (a visible hitch). */
    jankFrames: number;
    longTaskMs: number;
    /** Chrome's own accounting over the window (Performance.getMetrics deltas). */
    scriptMs: number;
    styleMs: number;
    layoutMs: number;
    layoutCount: number;
    styleCount: number;
    outputChildren: number;
    domNodes: number;
    heapMB: number;
}

const ANSI_LINES = [
    '\x1b[1;33mKrasnolud\x1b[0m mowi do ciebie: \x1b[36mNiech cie gory strzega, wedrowcze, bo droga na polnoc jest dluga.\x1b[0m',
    '\x1b[31mRudy ork\x1b[0m zadaje ci \x1b[1;31mbardzo ciezkie\x1b[0m obrazenia, trafiajac cie w lewe ramie swoim toporem.',
    'Jestes w waskim przejsciu miedzy skalami. Wiatr gwizdze tu glosno, niosac drobny piasek i zapach dymu.',
    '\x1b[32mWidoczne wyjscia:\x1b[0m polnoc, poludniowy-wschod, zachod i gora.',
    '\x1b[1;35m[Gildia]\x1b[0m \x1b[37mEldara\x1b[0m: ktos widzial dzis smoka pod Karakami? podobno zjadl caly oddzial.',
];

function makeLines(count: number, offset: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
        const n = offset + i;
        out.push(`${ANSI_LINES[n % ANSI_LINES.length]} #${n}`);
    }
    return out;
}

// Render-only lines: plain text (the two outputs treat a string message
// differently — stock parses it as HTML, forge as text — so no markup).
const stripAnsi = (line: string) => line.replace(/\x1b\[[0-9;]*m/g, '');

/**
 * `socket`: raw frames through the whole client (telnet, triggers, ANSI), one
 * output node per frame. `render`: one `message` per line straight to the
 * output, skipping the client — what the output itself costs.
 */
type FloodMode = 'socket' | 'render';

async function openShell(page: Page, shell: Shell): Promise<void> {
    await page.setViewportSize({ width: 1400, height: 850 });
    if (shell === 'stock') {
        await page.goto('/');
        await ensureGameSocket(page);
        await waitForCommandInput(page);
    } else {
        await page.goto('/?ui=forge');
        await page.waitForSelector('html[data-shell-ready]', { state: 'attached' });
        await page.locator('.gate__quiet').click();
        await page.waitForFunction(() =>
            ((window as any).__mockSockets ?? []).some((s: any) => String(s?.url).includes('arkadia.rpg.pl')));
        await page.locator('.gate').waitFor({ state: 'hidden' }).catch(() => undefined);
    }
    await page.locator('#main_text_output_msg_wrapper').waitFor();
    // Let the map, data loads and first paints settle before measuring.
    await page.waitForTimeout(1500);
}

async function metrics(cdp: CDPSession): Promise<Record<string, number>> {
    const { metrics: list } = await cdp.send('Performance.getMetrics');
    return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

/**
 * Push `chunks` socket frames of `perChunk` lines, one every `intervalMs`
 * (0 = all in one task), recording frame times until the output has painted.
 */
async function flood(page: Page, cdp: CDPSession, perChunk: number, chunks: number, intervalMs: number, offset: number, mode: FloodMode = 'socket'): Promise<FloodResult> {
    const payloads = Array.from({ length: chunks }, (_, i) => {
        const lines = makeLines(perChunk, offset + i * perChunk);
        return mode === 'socket' ? [lines.join('\n') + '\n'] : lines.map(stripAnsi);
    });
    const before = await metrics(cdp);
    const inPage = await page.evaluate(async ({ payloads, intervalMs, mode }) => {
        const w = window as any;
        const frames: number[] = [];
        let longTaskMs = 0;
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) longTaskMs += entry.duration;
        });
        try { observer.observe({ type: 'longtask', buffered: false }); } catch { /* unsupported */ }

        let last = performance.now();
        let running = true;
        const tick = (now: number) => {
            frames.push(now - last);
            last = now;
            if (running) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);

        const start = performance.now();
        let handleMs = 0;
        for (const payload of payloads) {
            const t0 = performance.now();
            if (mode === 'socket') w.__pushIncoming(payload[0]);
            else for (const line of payload) w.client.emit('message', line, undefined, Date.now());
            handleMs += performance.now() - t0;
            if (intervalMs > 0) await new Promise((r) => setTimeout(r, intervalMs));
        }
        // The frame after the last push has painted it.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const toPaintMs = performance.now() - start;
        running = false;
        // Long tasks are reported asynchronously.
        await new Promise((r) => setTimeout(r, 50));
        observer.disconnect();

        const sorted = [...frames].slice(1).sort((a, b) => a - b);
        const pick = (q: number) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : 0;
        const output = document.getElementById('main_text_output_msg_wrapper')!;
        return {
            handleMs,
            toPaintMs,
            frames: sorted.length,
            avgFrameMs: sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length),
            p95FrameMs: pick(0.95),
            maxFrameMs: sorted[sorted.length - 1] ?? 0,
            jankFrames: sorted.filter((f) => f > 50).length,
            longTaskMs,
            outputChildren: output.childElementCount,
            domNodes: document.getElementsByTagName('*').length,
            heapMB: ((performance as any).memory?.usedJSHeapSize ?? 0) / 1048576,
        };
    }, { payloads, intervalMs, mode });
    const after = await metrics(cdp);
    const d = (k: string) => (after[k] ?? 0) - (before[k] ?? 0);
    return {
        lines: perChunk * chunks,
        ...inPage,
        scriptMs: d('ScriptDuration') * 1000,
        styleMs: d('RecalcStyleDuration') * 1000,
        layoutMs: d('LayoutDuration') * 1000,
        layoutCount: d('LayoutCount'),
        styleCount: d('RecalcStyleCount'),
    };
}

async function scrollIntoHistory(page: Page): Promise<void> {
    const output = page.locator('#main_text_output_msg_wrapper');
    const box = await output.boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -600);
    await page.waitForFunction(() => !document.getElementById('split-bottom')?.classList.contains('split-hidden'));
}

const SCENARIOS: { name: string; perChunk: number; chunks: number; intervalMs: number; split: boolean; mode?: FloodMode }[] = [
    // Output only (no client pipeline): one node per line.
    { name: 'render 2000 lines at once', perChunk: 2000, chunks: 1, intervalMs: 0, split: false, mode: 'render' },
    { name: 'render 25 lines / 16 ms, 4 s', perChunk: 25, chunks: 250, intervalMs: 16, split: false, mode: 'render' },
    { name: 'render while scrolled up, 2 s', perChunk: 25, chunks: 125, intervalMs: 16, split: true, mode: 'render' },
    // One socket frame carrying 2000 lines: a login banner, a long `ob`, a replay.
    { name: 'burst 2000 in one frame', perChunk: 2000, chunks: 1, intervalMs: 0, split: false },
    // ~1500 lines/s for ~4 s: a sustained flood (combat spam, a fast walk).
    { name: 'flood 25 lines / 16 ms, 4 s', perChunk: 25, chunks: 250, intervalMs: 16, split: false },
    // The same flood while reading history (split view open, sticky mirror live).
    { name: 'flood while scrolled up, 2 s', perChunk: 25, chunks: 125, intervalMs: 16, split: true },
];

const CPU_RATES = process.env.BENCH_CPU ? [1, Number(process.env.BENCH_CPU)] : [1];
const results: Record<string, Record<string, FloodResult>> = {};

for (const cpu of CPU_RATES) {
    for (const shell of ['stock', 'forge'] as Shell[]) {
        test(`output flood — ${shell}, cpu x${cpu}`, async ({ page }) => {
            await openShell(page, shell);
            const cdp = await page.context().newCDPSession(page);
            await cdp.send('Performance.enable');
            if (cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });

            // Warm up: fill the buffer to its cap so every scenario also pays for trimming.
            await flood(page, cdp, 100, 12, 0, 0);

            let offset = 10_000;
            for (const s of SCENARIOS) {
                // Render-only emits on the transport, reached through the `window.client`
                // global — which only the stock shell sets.
                if (s.mode === 'render' && !(await page.evaluate(() => Boolean((window as any).client)))) continue;
                if (s.split) await scrollIntoHistory(page);
                const r = await flood(page, cdp, s.perChunk, s.chunks, s.intervalMs, offset, s.mode);
                offset += r.lines;
                const key = `${s.name} | cpu x${cpu}`;
                (results[key] ??= {})[shell] = r;
                if (s.split) {
                    await page.keyboard.press('End').catch(() => undefined);
                    await page.evaluate(() => {
                        const o = document.getElementById('main_text_output_msg_wrapper')!;
                        o.scrollTop = o.scrollHeight;
                    });
                }
                await page.waitForTimeout(300);
            }
        });
    }
}

// How handling one socket frame scales with its line count (stock shell; the
// client pipeline is shared). Linear would keep ms/line flat.
test('client pipeline scaling', async ({ page }) => {
    await openShell(page, 'stock');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    const rows: Record<string, number> = {};
    let offset = 50_000;
    for (const n of [125, 250, 500, 1000, 2000]) {
        const r = await flood(page, cdp, n, 1, 0, offset);
        offset += n;
        rows[n] = r.handleMs;
        await page.waitForTimeout(200);
    }
    console.log('\nclient pipeline scaling: lines in one frame -> handle ms (ms/line)');
    for (const [n, ms] of Object.entries(rows)) console.log(`  ${n.padStart(5)} -> ${ms.toFixed(1).padStart(8)} ms (${(ms / Number(n)).toFixed(3)})`);
    (results['client pipeline scaling'] ??= {}).stock = rows as unknown as FloodResult;
});

test.afterAll(() => {
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/output-bench.json', JSON.stringify(results, null, 2));
    const cols: (keyof FloodResult)[] = ['handleMs', 'toPaintMs', 'avgFrameMs', 'p95FrameMs', 'maxFrameMs', 'jankFrames', 'longTaskMs', 'scriptMs', 'styleMs', 'layoutMs', 'layoutCount', 'outputChildren', 'domNodes', 'heapMB'];
    for (const [scenario, byShell] of Object.entries(results)) {
        if (scenario === 'client pipeline scaling') continue;
        console.log(`\n${scenario}`);
        console.log(['metric'.padEnd(15), 'stock'.padStart(10), 'forge'.padStart(10)].join(' '));
        for (const c of cols) {
            const f = (v?: number) => (v === undefined ? '-' : v.toFixed(c.endsWith('Count') || c === 'jankFrames' || c === 'outputChildren' || c === 'domNodes' ? 0 : 1)).padStart(10);
            console.log([c.padEnd(15), f(byShell.stock?.[c]), f(byShell.forge?.[c])].join(' '));
        }
    }
});
