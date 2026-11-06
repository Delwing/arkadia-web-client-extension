/** A step as the player took it, whatever the map made of it then. */
export type JournalStep =
    | { kind: 'move'; direction: string; isTeamFollow: boolean }
    | { kind: 'follow'; direction: string; fullFollow?: string }
    | { kind: 'back' };

/**
 * Every step the mapper takes, as the player took it, written down so the steps
 * can be walked again from another room - see {@link PositionTracker.replayJournal}.
 * The game's own word on where we are ends it: a GMCP fix, /ustaw, the GPS.
 */
export class MoveJournal {
    private journal: { steps: JournalStep[]; placed: boolean } | null = null;
    /** Set while the mapper itself moves the map in a way that is neither step nor placement. */
    private recordingPaused = false;

    start(): void {
        this.journal = {steps: [], placed: false};
    }

    stop(): void {
        this.journal = null;
    }

    /** Whether the map has been placed - not stepped - since the journal started. */
    get placed(): boolean {
        return this.journal?.placed ?? false;
    }

    /** The steps written down, or null when there is no journal or the map has been placed since. */
    get replayableSteps(): readonly JournalStep[] | null {
        const journal = this.journal;
        return journal && !journal.placed ? journal.steps : null;
    }

    recordStep(step: JournalStep): void {
        if (this.journal && !this.journal.placed && !this.recordingPaused) this.journal.steps.push(step);
    }

    recordPlacement(): void {
        if (this.journal && !this.recordingPaused) this.journal.placed = true;
    }

    /** Run `fn` without writing anything it does down. */
    withoutRecording(fn: () => void): void {
        this.recordingPaused = true;
        try {
            fn();
        } finally {
            this.recordingPaused = false;
        }
    }
}
