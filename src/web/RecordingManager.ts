import {RecordedEvent, getRecording, saveRecording, getRecordingNames, deleteRecording} from './recordingStorage';
import {Recorder} from "@shared/recorder";
import eventBus from "@modules/core/eventBus";
import type {ClientEvents} from "@shared/events";
import {CommandOptions} from "@client/scripts/commandPreserveCaseMode";

const LAST_SESSION_RECORDING_NAME = 'Ostatnia sesja (auto)';

class RecordingManager {
    private recorder: Recorder<CommandOptions>;
    private autoRecorder: Recorder<CommandOptions> | null = null;
    private readonly activeRecorders = new Set<Recorder<CommandOptions>>();
    private readonly autoRecordingName = LAST_SESSION_RECORDING_NAME;
    private seenEchoSuppression = false;

    constructor() {
        this.recorder = this.createRecorder(false);

        eventBus.on('socket.incoming', (data: string) => {
            this.recordIncoming(data);
        });

        eventBus.on('socket.outgoing', (message: string) => {
            this.recordOutgoing(message);
        });

        eventBus.on('telnet.echo', (serverEchoing: boolean) => {
            if (serverEchoing) {
                this.seenEchoSuppression = true;
            } else if (this.seenEchoSuppression) {
                this.seenEchoSuppression = false;
                this.maybeStartAutoRecording();
            }
        });

        eventBus.on('client.connect', () => {
            this.seenEchoSuppression = false;
        });

        eventBus.on('client.disconnect', () => {
            void this.stopAutoRecording(true);
        });
    }

    getRecorder(): Recorder {
        return this.recorder;
    }

    startRecording(name: string) {
        if (this.activeRecorders.has(this.recorder)) {
            this.unregisterRecorder(this.recorder);
        }
        const recorder = this.createRecorder(false);
        this.recorder = recorder;
        this.registerRecorder(recorder);
        recorder.startRecording(name);
    }

    async stopRecording(save?: boolean) {
        if (!this.activeRecorders.has(this.recorder)) {
            return;
        }
        await this.recorder.stopRecording(save);
        this.unregisterRecorder(this.recorder);
    }

    async loadRecording(name: string) {
        await this.recorder.loadRecording(name);
    }

    listRecordings() {
        return this.recorder.listRecordings();
    }

    deleteRecording(name: string) {
        return this.recorder.deleteRecording(name);
    }

    stopPlayback() {
        this.recorder.stopPlayback();
    }

    pausePlayback() {
        this.recorder.pausePlayback();
    }

    resumePlayback() {
        this.recorder.resumePlayback();
    }

    stepForward() {
        this.recorder.stepForward();
    }

    stepBack() {
        this.recorder.stepBack();
    }

    replayLast() {
        this.recorder.replayLast();
    }

    startOver() {
        this.recorder.startOver();
    }

    setLoopStart() {
        this.recorder.setLoopStart();
    }

    setLoopEnd() {
        this.recorder.setLoopEnd();
    }

    toggleLoop() {
        this.recorder.toggleLoop();
    }

    clearLoop() {
        this.recorder.clearLoop();
    }

    getLoopState() {
        return this.recorder.getLoopState();
    }

    getRecordedMessages() {
        return this.recorder.getRecordedMessages();
    }

    setRecordedMessages(events: RecordedEvent[]) {
        this.recorder.setRecordedMessages(events);
    }

    replayRecordedMessages() {
        this.recorder.replayRecordedMessages();
    }

    replayRecordedMessagesTimed() {
        this.recorder.replayRecordedMessagesTimed();
    }

    setPlaybackSpeed(speed: number) {
        this.recorder.setPlaybackSpeed(speed);
    }

    getPlaybackSpeed() {
        return this.recorder.getPlaybackSpeed();
    }

    getActiveRecordingName() {
        if (this.recorder.isRecordingActive()) {
            return this.recorder.getCurrentRecordingName();
        }
        return null;
    }

    getAutoRecordingName() {
        if (this.autoRecorder && this.autoRecorder.isRecordingActive()) {
            return this.autoRecorder.getCurrentRecordingName();
        }
        return null;
    }

    async getRecordingSnapshot(name: string, options?: { recentMs?: number }): Promise<RecordedEvent[] | null> {
        const recorder = this.findRecorderByName(name);
        if (recorder) {
            if (options?.recentMs) {
                return recorder.getRecordedMessagesSince(options.recentMs);
            }
            return recorder.getRecordedMessages();
        }
        try {
            const events = await getRecording(name);
            if (events && options?.recentMs) {
                return this.filterRecentEvents(events, options.recentMs);
            }
            return events;
        } catch (error) {
            console.error('Failed to read recording snapshot:', error);
            return null;
        }
    }

    private maybeStartAutoRecording() {
        if (this.autoRecorder && this.autoRecorder.isRecordingActive()) return;
        const recorder = this.createRecorder(true);
        this.autoRecorder = recorder;
        this.registerRecorder(recorder);
        recorder.startRecording(this.autoRecordingName);
    }

    private recordIncoming(data: string) {
        this.activeRecorders.forEach(recorder => {
            try {
                recorder.handleIncoming(data);
            } catch (error) {
                console.error('Error recording incoming data:', error);
            }
        });
    }

    private recordOutgoing(message: string) {
        this.activeRecorders.forEach(recorder => {
            try {
                recorder.handleOutgoing(message);
            } catch (error) {
                console.error('Error recording outgoing data:', error);
            }
        });
    }

    private createRecorder(auto: boolean) {
        const recorder = new Recorder<CommandOptions>({
            processIncomingData: (d, opts) => eventBus.emit('playback.incomingData', d, opts),
            sendCommand: (cmd, echo, options) => {
                eventBus.emit('sendCommand', { command: cmd, echo: echo ?? false, options });
            },
            emit: (ev, ...args) => this.emitRecorderEvent(auto, recorder, ev, ...args),
            notifySendCommand: (command, echo = false, options) => {
                eventBus.emit('sendCommand', { command, echo: echo ?? false, options });
            },
        }, {
            saveRecording,
            getRecording,
            getRecordingNames,
            deleteRecording,
        }, eventBus);
        return recorder;
    }

    private registerRecorder(recorder: Recorder<CommandOptions>) {
        this.activeRecorders.add(recorder);
    }

    private unregisterRecorder(recorder: Recorder<CommandOptions>) {
        this.activeRecorders.delete(recorder);
        if (this.autoRecorder === recorder) {
            this.autoRecorder = null;
        }
    }

    private emitRecorderEvent(auto: boolean, recorder: Recorder<CommandOptions>, event: string, ...args: any[]) {
        if (auto) {
            if (event === 'recording.start') {
                eventBus.emit('recording.auto.start', recorder.getCurrentRecordingName());
                return;
            }
            if (event === 'recording.stop') {
                eventBus.emit('recording.auto.stop', recorder.getCurrentRecordingName(), ...args);
            }
        }
        (eventBus.emit as (...emitArgs: any[]) => void)(event as keyof ClientEvents, ...args);
    }

    private async stopAutoRecording(save?: boolean) {
        if (!this.autoRecorder || !this.activeRecorders.has(this.autoRecorder)) {
            this.autoRecorder = null;
            return;
        }
        const recorder = this.autoRecorder;
        this.unregisterRecorder(recorder);
        try {
            await recorder.stopRecording(save);
        } catch (error) {
            console.error('Failed to stop auto recording:', error);
        }
    }

    private findRecorderByName(name: string) {
        for (const recorder of this.activeRecorders) {
            if (recorder.getCurrentRecordingName && recorder.getCurrentRecordingName() === name) {
                return recorder;
            }
        }
        return null;
    }

    private filterRecentEvents(events: RecordedEvent[], durationMs: number) {
        const cutoff = Date.now() - durationMs;
        return events.filter(event => typeof event.timestamp === 'number' && event.timestamp >= cutoff);
    }
}

export default new RecordingManager();
export type { RecordingManager };
