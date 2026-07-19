#!/usr/bin/env node
// Repeatable rendering-performance benchmark: stock UI (DOM/HTML output) vs
// xterm-ui (xterm.js output). Simulates incoming game data by emitting
// synthetic `message` events on the app's real eventBus — the exact seam
// `mudClient` uses when real server text arrives — with a deterministic,
// seeded corpus of ANSI-coloured lines so results are reproducible run to
// run. Both UIs run through the same `Client`/`registerScripts` core; only
// the output-rendering layer differs, which is what this measures.
//
// Usage:
//   yarn bench:render                      # spawns vite dev automatically
//   BENCH_BASE_URL=http://localhost:5173 node bench/render-benchmark.mjs
//   BENCH_RUNS=8 node bench/render-benchmark.mjs
//
// Output: a console table (median across BENCH_RUNS runs per scenario) and
// bench/render-benchmark-results.json with every raw run for later analysis.

import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const RUNS_PER_SCENARIO = Number(process.env.BENCH_RUNS ?? 5);
const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

// ── Deterministic corpus ────────────────────────────────────────────────
// mulberry32: small, fast, seedable PRNG so the exact same "incoming data"
// is replayed on every run and for both UIs.
function mulberry32(seed) {
    return function () {
        seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const ANSI_ESC = String.fromCharCode(27);
const FG_CODES = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
const WORDS = [
    'Zadajesz', 'cios', 'mieczem', 'w', 'pierś', 'przeciwnika', 'Krew', 'tryska',
    'Uchylasz', 'się', 'od', 'ataku', 'Czujesz', 'ból', 'Regenerujesz', 'siły',
    'powoli', 'Widzisz', 'tu', 'wielki', 'las', 'pełen', 'cieni', 'Słyszysz',
    'warkot', 'wilka', 'w', 'oddali', 'Trafienie', 'krytyczne', 'Blok', 'Parada',
    'Kontratakujesz', 'zręcznie', 'Tracisz', 'równowagę', 'Wstajesz', 'powoli',
];

// A line looks like typical combat/room spam: a handful of differently
// coloured (and sometimes bold) segments concatenated together — the shape
// that actually stresses per-segment styling/SGR reconstruction.
function buildLine(rand) {
    const segments = 1 + Math.floor(rand() * 5);
    let line = '';
    for (let i = 0; i < segments; i++) {
        const wordCount = 1 + Math.floor(rand() * 6);
        const words = Array.from({ length: wordCount }, () => WORDS[Math.floor(rand() * WORDS.length)]);
        const text = words.join(' ');
        const fg = FG_CODES[Math.floor(rand() * FG_CODES.length)];
        const bold = rand() < 0.3 ? '1;' : '';
        line += `${ANSI_ESC}[${bold}${fg}m${text}${ANSI_ESC}[0m `;
    }
    return line.trimEnd();
}

function buildCorpus(seed, count) {
    const rand = mulberry32(seed);
    return Array.from({ length: count }, () => buildLine(rand));
}

// ── Scenarios & targets ─────────────────────────────────────────────────
const SCENARIOS = [
    // Worst case: a big burst (e.g. an AoE fight) landing in one tick, on an
    // otherwise-empty scrollback.
    { name: 'burst-empty', prefill: 0, burst: 300, paceMs: 0 },
    // Same burst, but the scrollback already holds a long session's worth of
    // history — exercises whichever UI's trimming/append cost grows with
    // existing buffer size.
    { name: 'burst-longscroll', prefill: 3000, burst: 300, paceMs: 0 },
    // A sustained, paced stream (~30 msgs/sec) — closer to normal fast combat
    // than an instantaneous burst.
    { name: 'steady-30-per-sec', prefill: 0, burst: 300, paceMs: 33 },
];

const TARGETS = [
    { name: 'stock', path: '/', readySelector: '#main_text_output_msg_wrapper' },
    { name: 'xterm-ui', path: '/xterm-ui/', readySelector: '.xterm-rows' },
];

const CDP_METRICS = ['ScriptDuration', 'TaskDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount', 'JSHeapUsedSize'];

// ── Per-run driver ───────────────────────────────────────────────────────
// Emission goes through the app's own live singletons, not a debug hook: we
// dynamically import the exact source URL the app itself imports
// (`/src/modules/core/eventBus.ts`), which the browser's ES module cache
// resolves to the SAME instance already wired up to the running UI. No
// product code changes needed to drive this benchmark.
async function importLiveModules(page) {
    return page.evaluate(async () => {
        const [{ default: eventBus }, { AnsiAwareBuffer }] = await Promise.all([
            import('/src/modules/core/eventBus.ts'),
            import('/src/client/ansi/FormatState.ts'),
        ]);
        window.__bench = { eventBus, AnsiAwareBuffer };
    });
}

async function emitLines(page, lines, paceMs) {
    return page.evaluate(async ({ lines, paceMs }) => {
        const { eventBus, AnsiAwareBuffer } = window.__bench;
        const t0 = performance.now();
        for (const line of lines) {
            eventBus.emit('message', new AnsiAwareBuffer(line), 'combat');
            if (paceMs > 0) await new Promise((r) => setTimeout(r, paceMs));
        }
        const t1 = performance.now();
        // Settle: two rAFs guarantees at least one full paint has happened
        // after the last DOM mutation / xterm write.
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const t2 = performance.now();
        return { emitDurationMs: t1 - t0, settleDurationMs: t2 - t1, totalMs: t2 - t0 };
    }, { lines, paceMs });
}

async function runOnce(browser, target, scenario) {
    const page = await browser.newPage();
    await page.goto(`${process.env.BENCH_BASE_URL ?? 'http://localhost:5183'}${target.path}`, {
        waitUntil: 'load',
        timeout: 30000,
    });
    await page.waitForSelector(target.readySelector, { timeout: 20000 });
    await importLiveModules(page);
    // Wait until the real UI's own message listener(s) are actually attached
    // (registerScripts/output handler wiring can lag one microtask behind
    // module import), so emitted lines aren't dropped on the floor.
    await page.waitForFunction(
        () => window.__bench.eventBus.listenerCount('message') > 0,
        { timeout: 15000 },
    );
    // Let the initial burst of feature-script network fetches (herbs/magics/
    // knowledge — all fail fast in this offline sandbox) settle so it
    // doesn't bleed into the measurement window.
    await page.waitForTimeout(1500);

    const prefillCorpus = buildCorpus(1, scenario.prefill);
    const burstCorpus = buildCorpus(2, scenario.burst);

    if (prefillCorpus.length > 0) {
        await emitLines(page, prefillCorpus, 0);
    }

    const session = await page.context().newCDPSession(page);
    await session.send('Performance.enable');
    const before = (await session.send('Performance.getMetrics')).metrics;

    await page.evaluate(() => {
        window.__benchLongtasks = [];
        window.__benchObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) window.__benchLongtasks.push(entry.duration);
        });
        window.__benchObserver.observe({ entryTypes: ['longtask'] });
    });

    const timing = await emitLines(page, burstCorpus, scenario.paceMs);

    const after = (await session.send('Performance.getMetrics')).metrics;
    const longtasks = await page.evaluate(() => {
        window.__benchObserver.disconnect();
        return window.__benchLongtasks;
    });

    const delta = (name) => {
        const b = before.find((m) => m.name === name)?.value ?? 0;
        const a = after.find((m) => m.name === name)?.value ?? 0;
        return a - b;
    };

    await page.close();

    return {
        ...timing,
        scriptDurationMs: delta('ScriptDuration') * 1000,
        taskDurationMs: delta('TaskDuration') * 1000,
        layoutDurationMs: delta('LayoutDuration') * 1000,
        recalcStyleDurationMs: delta('RecalcStyleDuration') * 1000,
        layoutCount: delta('LayoutCount'),
        recalcStyleCount: delta('RecalcStyleCount'),
        jsHeapDeltaMb: delta('JSHeapUsedSize') / (1024 * 1024),
        longtaskCount: longtasks.length,
        longtaskTotalMs: longtasks.reduce((s, d) => s + d, 0),
    };
}

// ── Orchestration ────────────────────────────────────────────────────────
function median(nums) {
    const s = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function summarize(runs) {
    const keys = Object.keys(runs[0]);
    const out = {};
    for (const key of keys) out[key] = median(runs.map((r) => r[key]));
    return out;
}

async function waitForServer(url, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(url);
            if (res.ok) return true;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 300));
    }
    return false;
}

async function main() {
    let baseUrl = process.env.BENCH_BASE_URL;
    let devServer = null;

    if (!baseUrl) {
        baseUrl = 'http://localhost:5183';
        const alreadyUp = await waitForServer(baseUrl, 1000).catch(() => false);
        if (!alreadyUp) {
            console.log(`Starting vite dev server on ${baseUrl} ...`);
            devServer = spawn('npx', ['vite', '--port', '5183', '--strictPort'], {
                cwd: ROOT,
                stdio: 'ignore',
                detached: true,
            });
            const up = await waitForServer(baseUrl + '/', 30000);
            if (!up) throw new Error('vite dev server did not become ready in time');
        }
    }
    process.env.BENCH_BASE_URL = baseUrl;

    const browser = await chromium.launch({ executablePath: CHROMIUM_PATH });
    const results = [];

    try {
        for (const target of TARGETS) {
            for (const scenario of SCENARIOS) {
                process.stdout.write(`Running ${target.name} / ${scenario.name} (${RUNS_PER_SCENARIO} runs)... `);
                const runs = [];
                for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
                    runs.push(await runOnce(browser, target, scenario));
                }
                console.log('done');
                results.push({ target: target.name, scenario: scenario.name, runs, summary: summarize(runs) });
            }
        }
    } finally {
        await browser.close();
        if (devServer) {
            process.kill(-devServer.pid);
        }
    }

    writeFileSync(resolve(__dirname, 'render-benchmark-results.json'), JSON.stringify(results, null, 2));

    console.log('\nMedian over', RUNS_PER_SCENARIO, 'runs (times in ms unless noted):\n');
    console.table(results.map((r) => ({
        target: r.target,
        scenario: r.scenario,
        totalMs: r.summary.totalMs.toFixed(1),
        emitMs: r.summary.emitDurationMs.toFixed(1),
        scriptMs: r.summary.scriptDurationMs.toFixed(1),
        layoutMs: r.summary.layoutDurationMs.toFixed(1),
        recalcStyleMs: r.summary.recalcStyleDurationMs.toFixed(1),
        layoutCount: r.summary.layoutCount.toFixed(0),
        longtasks: r.summary.longtaskCount.toFixed(0),
        longtaskMs: r.summary.longtaskTotalMs.toFixed(1),
        heapDeltaMb: r.summary.jsHeapDeltaMb.toFixed(2),
    })));

    console.log('\nNote: stock trims scrollback to Ustawienia > outputMaxElements (default 1000 DOM');
    console.log('nodes); xterm-ui keeps a 5000-line xterm scrollback. Different caps by design —');
    console.log('see bench/README.md for what each column means and other caveats.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
