import {expect, test as base} from '@playwright/test';
import {
    installMockWebSocket,
    mockGithubDeployments,
    mockKnowledgeDownload,
    mockMagicKeysDownload,
    mockMagicsDownload,
    mockMapDownloads,
    mockMapReleaseVersion,
    mockNpcDownload,
    mockPeopleDownload,
    mockWiedzaDownload,
} from './mocks';

const test = base.extend({
    context: async ({context}, use) => {
        // Block external network requests that can stall page load
        await context.route(/googletagmanager\.com|google-analytics\.com|buycoffee\.to|fonts\.googleapis\.com|fonts\.gstatic\.com/, route => route.abort());

        // Disable Google Analytics and Firebase in tests
        await context.addInitScript(() => {
            // @ts-expect-error for disabling GA
            window.__DISABLE_GA__ = true;
            // @ts-expect-error for disabling Firebase
            window.__DISABLE_FIREBASE__ = true;
        });

        // Dialog open/close animations are what the dialog framework refuses to
        // interrupt: a hide() issued mid-animation is dropped on the floor,
        // which is the classic _isTransitioning race in CI. Nothing in the
        // suite depends on a dialog animating, so switch those animations off
        // - addressed by the app's own id convention rather than by framework
        // class names. (Keep it to dialogs: MobileCommandRadial gates a
        // `display:none` on `transitionend` and pipeStatus lands its smoke on
        // `animationiteration`, so a blanket rule would stall both.)
        await context.addInitScript(() => {
            function injectNoTransitions() {
                const style = document.createElement('style');
                style.textContent =
                    // The windows in index.html, and the card inside each one.
                    '[id$="-modal"], [id$="-modal"] > div { transition: none !important; }' +
                    // The dimmed backdrop is appended straight to <body> by the
                    // dialog framework, so it is the one piece of dialog chrome
                    // with no id of ours to name it by. `transition` does not
                    // inherit, so this reaches no content inside those nodes.
                    'body > div:not([id]) { transition: none !important; }';
                document.head.appendChild(style);
            }
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', injectNoTransitions, {once: true});
            } else {
                injectNoTransitions();
            }
        });

        await mockMapDownloads(context);
        await mockMapReleaseVersion(context);
        await mockMagicsDownload(context);
        await mockMagicKeysDownload(context);
        await mockNpcDownload(context);
        await mockPeopleDownload(context);
        await mockKnowledgeDownload(context);
        await mockWiedzaDownload(context);
        await mockGithubDeployments(context);
        await installMockWebSocket(context);
        // eslint-disable-next-line react-hooks/rules-of-hooks
        await use(context);
    },
});

export {expect, test};
