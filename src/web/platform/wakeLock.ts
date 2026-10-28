import NoSleep from 'nosleep.js';

/**
 * Keeps a phone from sleeping the tab while the game is connected.
 *
 * NoSleep can only be turned on inside a user gesture, so activating arms it for
 * the next touch or click; Android releases the lock whenever the tab is hidden,
 * so it is taken again each time the tab comes back.
 */
export class WakeLock {
    private noSleep: NoSleep | null = null;
    private active = false;
    private enabled = false;
    private visibilityHooked = false;
    private readonly listeners = new Set<(enabled: boolean) => void>();
    private readonly enableNoSleep = async () => {
        try {
            await this.noSleep!.enable();
            this.enabled = this.noSleep!.isEnabled;
            console.log('NoSleep enabled:', this.enabled);
        } catch (err) {
            this.enabled = false;
            console.warn('NoSleep failed to enable:', err);
        }
        this.notify();
    };

    /** Whether the lock is actually held. */
    isEnabled(): boolean {
        return this.enabled;
    }

    subscribe(listener: (enabled: boolean) => void): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    activate(): void {
        if (this.active) return;
        this.active = true;
        if (!this.noSleep) {
            this.noSleep = new NoSleep();
        }
        if (!this.visibilityHooked) {
            this.visibilityHooked = true;
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible' && this.active && this.noSleep) {
                    void this.enableNoSleep();
                }
            });
        }
        document.addEventListener('touchstart', this.enableNoSleep, {once: true});
        document.addEventListener('click', this.enableNoSleep, {once: true});
    }

    deactivate(): void {
        if (!this.active) return;
        this.active = false;
        this.noSleep?.disable();
        this.enabled = false;
        this.notify();
    }

    toggle(): void {
        if (this.enabled) {
            this.deactivate();
        } else {
            this.activate();
        }
    }

    private notify(): void {
        for (const listener of [...this.listeners]) listener(this.enabled);
    }
}
