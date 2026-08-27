vi.mock('@client/main', () => ({
  __esModule: true,
}));

vi.mock('@client/sounds', () => ({
  __esModule: true,
  beepSound: 'mock-sound',
}));

vi.mock('@modules/core/customSounds', () => ({
  __esModule: true,
  getCustomSound: vi.fn().mockResolvedValue(undefined),
  getCustomSounds: vi.fn().mockResolvedValue([]),
}));

import SoundManager from '@client/SoundManager';

/**
 * The near-silent keepalive loop is what keeps Chrome's transient activation alive, so
 * a sound played minutes after the last tap is still audible. It must not depend on the
 * sound cache having finished loading — that download races the user's first taps on a
 * cold mobile load, and losing the race used to mean no loop and silent sounds.
 *
 * Every test constructs its manager and taps within the same tick, so the async
 * preload has not resolved and `elements` is genuinely empty: the cold-load state.
 * The keepalive element is told apart from primed sound elements by its src, which
 * is the generated WAV data URI.
 */
describe('SoundManager keepalive loop', () => {
    let played: string[] = [];
    let nextRejection: Error | null = null;

    const keepalivePlays = () => played.filter(src => src.startsWith('data:audio/wav')).length;
    const tap = () => document.dispatchEvent(new Event('pointerdown'));
    const createManager = () => new SoundManager({on: vi.fn(), sendEvent: vi.fn()} as any);

    beforeEach(() => {
        played = [];
        nextRejection = null;
        (HTMLMediaElement.prototype as any).play = vi.fn(function (this: HTMLAudioElement) {
            played.push(this.src);
            // Aimed at the keepalive element specifically: managers from earlier tests
            // keep their document listeners, and their sound-element priming would
            // otherwise swallow the refusal meant for this one.
            if (nextRejection && this.src.startsWith('data:audio/wav')) {
                const err = nextRejection;
                nextRejection = null;
                return Promise.reject(err);
            }
            return Promise.resolve();
        });
        (HTMLMediaElement.prototype as any).pause = vi.fn();
    });

    it('starts on the first gesture even with no sounds cached yet', () => {
        createManager();
        played = [];

        tap();

        expect(keepalivePlays()).toBe(1);
    });

    it('starts once, not once per gesture', () => {
        createManager();
        played = [];

        tap();
        tap();
        tap();

        expect(keepalivePlays()).toBe(1);
    });

    it('does not start before any gesture', () => {
        createManager();

        expect(keepalivePlays()).toBe(0);

        // Settle this manager before leaving: its listeners outlive the test, and one
        // with an unstarted keepalive would answer the next test's gesture first.
        tap();
    });

    // Last on purpose: a refused start deliberately re-arms itself, so this manager
    // stays live on the document and would answer a later test's gesture.
    it('retries on a later gesture when the first play is refused', async () => {
        createManager();
        played = [];
        nextRejection = Object.assign(new Error('refused'), {name: 'NotAllowedError'});

        tap();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(keepalivePlays()).toBe(1);

        tap();

        expect(keepalivePlays()).toBe(2);
    });
});
