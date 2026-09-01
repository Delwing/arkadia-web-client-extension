/**
 * A process-wide handle on whichever command line the UI is currently running.
 *
 * Normally a UI has exactly one command line and nothing needs this. The boss
 * key overlay is the exception: it draws its own input over the whole client and
 * has to send from there. Giving it a second {@link CommandLineEngine} looked
 * fine and was not -- two engines over one `commandHistory` key do not merely
 * drift, they *clobber*: each keeps its ring in memory from construction and
 * rewrites the whole key on submit, so whichever engine sends last erases the
 * other's entries.
 *
 * So there stays exactly one engine, and anything else that needs to send a
 * command borrows it through this registry. History, Tab completion, password
 * mode and command echo are then all the real ones, automatically.
 *
 * Every operation takes the borrower's current text and returns the text the
 * command line ended up with, so a borrower with its own input can mirror the
 * result without touching the engine's field itself.
 */
export interface ActiveCommandLine {
    /** Send `text` exactly as if it had been typed and submitted here. */
    submit(text: string): void;
    /** Browse history from `text`; returns the entry to display. */
    historyMove(text: string, direction: "up" | "down"): string;
    /** Tab-complete `text`; returns the completed text. */
    tabComplete(text: string, forward: boolean): string;
    /** Leave the real field empty (the borrower is done with it). */
    reset(): void;
}

let active: ActiveCommandLine | null = null;

/** Register the UI's command line. Called by the UI's own adapter on attach. */
export function setActiveCommandLine(commandLine: ActiveCommandLine | null): void {
    active = commandLine;
}

/** The UI's command line, or null before one is attached. */
export function getActiveCommandLine(): ActiveCommandLine | null {
    return active;
}
