import { exportNotes, replaceAllNotes } from "../../locationNotesStorage";
import { loadFirebaseSettings } from "@modules/firebase/firebaseTypes";
import type { CategoryHandler } from "../categoryHandler";

export const locationNotesCategory: CategoryHandler = {
    async export() {
        const locationNotes = await exportNotes();
        if (locationNotes.length > 0) return JSON.stringify(locationNotes);
        // Deleting the last note must still sync as an empty list — with
        // no data the sync treats this device as fresh and pulls the
        // deleted notes back. A device that never synced notes exports
        // nothing, so it takes the cloud notes instead of conflicting.
        return loadFirebaseSettings().categorySyncChecksums.locationNotes !== undefined ? '[]' : null;
    },
    async import(data) {
        await replaceAllNotes(Array.isArray(data) ? data : []);
    },
};
