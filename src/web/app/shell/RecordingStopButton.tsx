import { useState, type Ref } from "react";
import { useClientEvent } from "@web-ui/hooks";
import recordingManager from "../../RecordingManager";

/** Over the game output while recording (style.css #recording-button): stop and save. */
export function RecordingStopButton({ ref }: { ref?: Ref<HTMLButtonElement> }) {
    const [recording, setRecording] = useState(false);
    useClientEvent("recording.start", () => setRecording(true));
    useClientEvent("recording.stop", () => setRecording(false));

    return (
        <button
            id="recording-button"
            ref={ref}
            type="button"
            className="popup-btn popup-btn--control popup-btn--sm recordings-rec"
            style={{ display: recording ? "inline-flex" : "none" }}
            onClick={() => { void recordingManager.stopRecording(true); }}
        >
            Zatrzymaj i zapisz
        </button>
    );
}
