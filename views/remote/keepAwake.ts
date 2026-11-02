/**
 * Keep the phone's screen on while it drives the PC.
 *
 * The Screen Wake Lock API exists only on secure pages, and the phone usually
 * opens this page over plain http on the local network. There the fallback is
 * the one NoSleep-style libraries use: a muted, inline video playing in a
 * loop, which the browser keeps the screen on for. Its frames come from a tiny
 * canvas, so no media file ships with the page.
 *
 * The browser drops a wake lock whenever the page is hidden, so it is taken
 * again each time the page comes back.
 */

export function keepAwake(): () => void {
    let stopped = false;
    let lock: WakeLockSentinel | null = null;
    let video: HTMLVideoElement | null = null;
    let painter: number | undefined;

    const requestLock = () => {
        if (stopped || document.visibilityState !== 'visible' || lock) return;
        navigator.wakeLock.request('screen')
            .then(sentinel => {
                if (stopped) {
                    void sentinel.release();
                    return;
                }
                lock = sentinel;
                sentinel.addEventListener('release', () => {
                    if (lock === sentinel) lock = null;
                });
            })
            .catch(() => undefined);
    };

    const startVideo = () => {
        if (stopped || video) return;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 2;
        const context = canvas.getContext('2d');
        if (!context || typeof canvas.captureStream !== 'function') return;
        let tick = 0;
        const paint = () => {
            context.fillStyle = tick++ % 2 ? '#000' : '#010101';
            context.fillRect(0, 0, 2, 2);
        };
        paint();
        painter = window.setInterval(paint, 1000);

        video = document.createElement('video');
        video.muted = true;
        video.playsInline = true;
        video.setAttribute('playsinline', '');
        video.loop = true;
        video.srcObject = canvas.captureStream(1);
        // On the page, but too small and faint to see: a video the browser thinks is hidden may not count.
        video.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:0.01;pointer-events:none;';
        document.body.append(video);
        play();
    };

    // Muted inline video may autoplay; where it may not, the next tap starts it.
    const play = () => {
        if (!video || stopped) return;
        video.play().catch(() => {
            document.addEventListener('pointerdown', play, { once: true });
        });
    };

    const onVisible = () => {
        if (document.visibilityState !== 'visible') return;
        if ('wakeLock' in navigator) requestLock();
        else play();
    };

    if ('wakeLock' in navigator) requestLock();
    else startVideo();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
        stopped = true;
        document.removeEventListener('visibilitychange', onVisible);
        document.removeEventListener('pointerdown', play);
        void lock?.release();
        lock = null;
        window.clearInterval(painter);
        if (video) {
            video.pause();
            video.srcObject = null;
            video.remove();
            video = null;
        }
    };
}
