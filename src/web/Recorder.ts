import { Recorder as RecorderBase, type RecorderHooks, type RecorderStorage } from "@shared/recorder";
import { saveRecording, getRecording, getRecordingNames, deleteRecording } from "./recordingStorage";
import { type CommandOptions } from "@client/scripts/commandPreserveCaseMode";
import eventBus from "@modules/core/eventBus";

type WebRecorderHooks = RecorderHooks<CommandOptions>;

const storage: RecorderStorage = {
    saveRecording,
    getRecording,
    getRecordingNames,
    deleteRecording,
};

export default class Recorder extends RecorderBase<CommandOptions> {
    constructor(hooks: WebRecorderHooks) {
        const mergedHooks: WebRecorderHooks = {
            ...hooks,
            notifySendCommand: (command: string, echo = false, options?: CommandOptions) => {
                eventBus.emit('sendCommand', { command, echo: echo ?? false, options });
                hooks.notifySendCommand?.(command, echo, options);
            },
        };

        super(mergedHooks, storage);
    }
}

export type { RecordedEvent } from "@shared/recorder";
