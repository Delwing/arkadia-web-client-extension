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
 * On Android the near-silent keepalive loop is what keeps the tab out of Chrome's
 * freezer, and a frozen tab loses the game connection. It therefore must not depend
 * on the sound cache having finished loading — that download races the user's first
 * taps on a cold mobile load, and losing the race used to mean no protection at all.
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

    it('reports never having started before any gesture', () => {
        const manager = createManager();

        expect(manager.keepaliveDetail.startedAt).toBe(0);
        expect(manager.keepaliveDetail.running).toBe(false);

        // Settle this manager before leaving: its listeners outlive the test, and one
        // with an unstarted keepalive would answer the next test's gesture first.
        tap();
    });

    // Last on purpose: a refused start deliberately re-arms itself, so this manager
    // stays live on the document and would answer a later test's gesture.
    it('records the refusal and retries on a later gesture', async () => {
        const manager = createManager();
        played = [];
        nextRejection = Object.assign(new Error('refused'), {name: 'NotAllowedError'});

        tap();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(manager.keepaliveDetail.error).toBe('NotAllowedError');
        expect(keepalivePlays()).toBe(1);

        tap();

        expect(keepalivePlays()).toBe(2);
    });
});
