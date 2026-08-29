import fs from 'node:fs';
import {encodeGmcp} from '@shared/socket';
import arkadiaClient from '@web/MudClient';
import {setupOutputMessageHandler} from '@shared/dom/outputMessageHandler';

/**
 * How much does a replayed absence actually weigh?
 *
 * The proxy holds output while a player's tab is frozen and replays it on return, so two
 * numbers decide how the buffer should be sized: the *raw* bytes the game puts on the
 * wire per minute, and how long the client takes to swallow that in one go. Guessing
 * either would be guessing about whether a returning player gets their session back or a
 * locked-up phone.
 *
 * Raw is the operative word. A log records what was rendered; Arkadia sends it as base64
 * inside a `gmcp_msgs` envelope, with `char.vitals` traffic besides that never appears in
 * a log at all. So the frames here are built with the client's own encoder rather than
 * estimated from the text.
 *
 * Driven by a real session log when one is present — set ARKADIA_LOG_LINES to a JSON
 * array of lines — and by synthesised text otherwise, so it runs in CI without one.
 */
describe('replay volume', () => {
    const fixture = process.env.ARKADIA_LOG_LINES;

    const lines: string[] = fixture && fs.existsSync(fixture)
        ? JSON.parse(fs.readFileSync(fixture, 'utf8'))
        : Array.from({length: 3000}, (_, i) =>
            `Kostur ${i} uderza cie potwornie silnie w tors, ale nie robi ci to wiekszej krzywdy.`);

    // Roughly what Arkadia sends alongside text: vitals after most actions.
    const VITALS_EVERY = 3;

    function rawFrames(sample: string[]): string[] {
        const frames: string[] = [];
        sample.forEach((line, i) => {
            frames.push(encodeGmcp('gmcp_msgs', {
                type: 'text',
                text: Buffer.from(line + '\n', 'utf8').toString('base64'),
            }));
            if (i % VITALS_EVERY === 0) {
                frames.push(encodeGmcp('char.vitals', {
                    hp: 850, max_hp: 900, fatigue: 400, max_fatigue: 500,
                    mana: 120, max_mana: 200, stuffed: 30, soaked: 20, encumbrance: 12,
                }));
            }
        });
        return frames;
    }

    beforeEach(() => {
        document.body.innerHTML = `
          <div id="main_text_output_msg_wrapper">
            <div id="split-bottom" class="split-hidden">
              <div id="split-handle"></div>
              <div id="sticky-area"></div>
            </div>
          </div>
        `;
    });

    it('reports what an absence costs in bytes and in milliseconds', () => {
        const outputWrapper = document.getElementById('main_text_output_msg_wrapper') as HTMLElement;
        setupOutputMessageHandler(arkadiaClient, {
            outputWrapper,
            splitBottom: document.getElementById('split-bottom') as HTMLElement,
            splitHandle: document.getElementById('split-handle') as HTMLElement,
            stickyArea: document.getElementById('sticky-area') as HTMLElement,
            stickyLines: 15,
        });

        // The log spans 53.5 minutes; scale a slice of it to the absences that matter.
        const linesPerMinute = lines.length / 53.5;

        for (const minutes of [5, 15, 25]) {
            const slice = lines.slice(0, Math.round(linesPerMinute * minutes));
            const frames = rawFrames(slice);
            const rawBytes = frames.reduce((n, f) => n + f.length, 0);

            const start = performance.now();
            for (const frame of frames) {
                (arkadiaClient as any).processIncomingData(frame);
            }
            const elapsed = performance.now() - start;

            console.log(
                `${String(minutes).padStart(2)} min away: ${slice.length} lines, ` +
                `${(rawBytes / 1024).toFixed(0)} KB raw ` +
                `(${(rawBytes / slice.length).toFixed(0)} B/line), ` +
                `replayed in ${elapsed.toFixed(0)} ms`,
            );
        }

        // The buffer is sized from bytes-per-line, so guard the assumption rather than
        // just printing it: if the protocol grows a fatter envelope, this fails and the
        // sizing gets revisited instead of quietly overflowing.
        const sample = rawFrames(lines.slice(0, 500));
        const bytesPerLine = sample.reduce((n, f) => n + f.length, 0) / 500;
        expect(bytesPerLine).toBeGreaterThan(80);
        expect(bytesPerLine).toBeLessThan(400);
    });
});
