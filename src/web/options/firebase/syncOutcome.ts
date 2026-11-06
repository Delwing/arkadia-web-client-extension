/** What a sync action has to tell the user: a status toast or an error toast. */
export interface SyncOutcome {
    status?: string;
    error?: string;
}
