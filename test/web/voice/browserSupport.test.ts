import {describe, expect, it} from 'vitest';
import {hasWorkingSpeechService, type NavigatorLike} from '@web/voice/browserSupport';

const CHROME: NavigatorLike = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    userAgentData: {brands: [{brand: 'Not_A Brand'}, {brand: 'Chromium'}, {brand: 'Google Chrome'}]},
};

const EDGE: NavigatorLike = {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
    userAgentData: {brands: [{brand: 'Chromium'}, {brand: 'Microsoft Edge'}, {brand: 'Not_A Brand'}]},
};

describe('hasWorkingSpeechService', () => {
    it('accepts Chrome', () => {
        expect(hasWorkingSpeechService(CHROME)).toBe(true);
    });

    it('accepts Edge', () => {
        expect(hasWorkingSpeechService(EDGE)).toBe(true);
    });

    it('rejects Brave, which reports itself as Chrome in every other way', () => {
        expect(hasWorkingSpeechService({...CHROME, brave: {isBrave: () => Promise.resolve(true)}})).toBe(false);
    });

    it('rejects Vivaldi and Opera', () => {
        expect(hasWorkingSpeechService({...CHROME, userAgent: CHROME.userAgent + ' Vivaldi/7.0'})).toBe(false);
        expect(hasWorkingSpeechService({...CHROME, userAgent: CHROME.userAgent + ' OPR/115.0.0.0'})).toBe(false);
    });

    it('rejects a plain Chromium build, which carries no speech credentials', () => {
        expect(
            hasWorkingSpeechService({
                userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                userAgentData: {brands: [{brand: 'Chromium'}, {brand: 'Not_A Brand'}]},
            }),
        ).toBe(false);
    });

    it('rejects Firefox, which has no recogniser at all', () => {
        expect(hasWorkingSpeechService({userAgent: 'Mozilla/5.0 (Windows NT 10.0; rv:133.0) Gecko/20100101 Firefox/133.0'})).toBe(false);
    });

    it('falls back to the user-agent when brands are missing', () => {
        expect(hasWorkingSpeechService({userAgent: CHROME.userAgent})).toBe(true);
        expect(hasWorkingSpeechService({userAgent: EDGE.userAgent})).toBe(true);
    });

    it('rejects a fork by user-agent even without brands', () => {
        expect(hasWorkingSpeechService({userAgent: CHROME.userAgent + ' Vivaldi/7.0'})).toBe(false);
    });

    it('rejects a navigator that names nothing', () => {
        expect(hasWorkingSpeechService({})).toBe(false);
    });
});
