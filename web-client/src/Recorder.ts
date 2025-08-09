import { saveRecording, getRecording, getRecordingNames, deleteRecording, RecordedEvent } from './recordingStorage';

export interface RecorderHooks {
    processIncomingData(data: string): void;
    sendCommand(command: string, echo?: boolean): void;
    emit(event: string, ...args: any[]): void;
}

export default class Recorder {
    private isRecording = false;
    private recordedMessages: RecordedEvent[] = [];
    private currentRecordingName: string | null = null;
    private playbackTimeout: number | null = null;
    private playbackIndex = 0;
    private playbackDelay = 0;
    private playbackStart = 0;
    private pausedDelay = 0;
    private isPlaying = false;
    private paused = false;

    constructor(private hooks: RecorderHooks) {}

    handleIncoming(message: string) {
        if (this.isRecording) {
            this.recordedMessages.push({
                message,
                timestamp: Date.now(),
                direction: 'in'
            });
        }
    }

    handleOutgoing(message: string) {
        if (this.isRecording) {
            this.recordedMessages.push({
                message,
                timestamp: Date.now(),
                direction: 'out'
            });
        }
    }

    startRecording(name: string) {
        this.recordedMessages = [];
        this.currentRecordingName = name;
        this.isRecording = true;
        this.hooks.emit('recording.start', name);
    }

    async stopRecording(save?: boolean) {
        this.isRecording = false;
        if (save && this.currentRecordingName) {
            await saveRecording(this.currentRecordingName, this.recordedMessages);
        }
        this.hooks.emit('recording.stop', save);
        this.currentRecordingName = null;
    }

    async loadRecording(name: string) {
        const data = await getRecording(name);
        this.recordedMessages = data || [];
    }

    listRecordings() {
        return getRecordingNames();
    }

    deleteRecording(name: string) {
        return deleteRecording(name);
    }

    stopPlayback() {
        if (this.playbackTimeout !== null) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
        }
        this.isPlaying = false;
        this.paused = false;
        this.playbackIndex = 0;
        this.hooks.emit('playback.stop');
    }

    pausePlayback() {
        if (!this.isPlaying || this.paused) return;
        if (this.playbackTimeout !== null) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
            this.pausedDelay = Math.max(0, this.playbackDelay - (Date.now() - this.playbackStart));
        }
        this.paused = true;
        this.hooks.emit('playback.pause');
    }

    resumePlayback() {
        if (!this.isPlaying || !this.paused) return;
        this.paused = false;
        this.scheduleNext(this.pausedDelay);
        this.hooks.emit('playback.resume');
    }

    stepForward() {
        if (!this.isPlaying) return;
        if (this.playbackTimeout !== null) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
        }
        this.paused = true;
        this.executeCurrent();
    }

    stepBack() {
        if (!this.isPlaying || this.playbackIndex === 0) return;
        if (this.playbackTimeout !== null) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
        }
        this.paused = true;
        if (this.playbackIndex >= 2) {
            this.playbackIndex -= 2;
        } else {
            this.playbackIndex = 0;
        }
        this.executeCurrent();
    }

    replayLast() {
        if (!this.isPlaying || this.playbackIndex === 0) return;
        const ev = this.recordedMessages[this.playbackIndex - 1];
        this.playEvent(ev);
    }

    getRecordedMessages() {
        return this.recordedMessages.slice();
    }

    setRecordedMessages(events: RecordedEvent[]) {
        this.recordedMessages = events.slice();
    }

    replayRecordedMessages() {
        if (this.recordedMessages.length === 0) return;
        this.stopPlayback();
        this.isPlaying = true;
        this.hooks.emit('playback.start');
        Output.send('== Playback start ==');
        this.recordedMessages.forEach(ev => {
            if (ev.direction === 'in') {
                this.hooks.processIncomingData(ev.message);
            } else {
                Output.send('-> ' + ev.message);
            }
        });
        Output.send('== Playback end ==');
        this.stopPlayback();
    }

    replayRecordedMessagesTimed() {
        if (this.recordedMessages.length === 0) return;
        this.stopPlayback();
        this.isPlaying = true;
        this.paused = false;
        this.playbackIndex = 0;
        this.hooks.emit('playback.start', this.recordedMessages.length);
        Output.send('== Playback start ==');
        this.hooks.emit('playback.index', 0, this.recordedMessages.length);
        this.scheduleNext(0);
    }

    private playEvent(ev: RecordedEvent) {
        if (ev.direction === 'in') {
            this.hooks.processIncomingData(ev.message);
        } else {
            window.clientExtension.sendCommand(ev.message)
            this.hooks.sendCommand(ev.message);
        }
    }

    private executeCurrent() {
        const ev = this.recordedMessages[this.playbackIndex];
        if (!ev) {
            Output.send('== Playback end ==');
            this.stopPlayback();
            return;
        }
        this.playEvent(ev);
        this.playbackIndex++;
        this.hooks.emit('playback.index', this.playbackIndex, this.recordedMessages.length);
    }

    private scheduleNext(initialDelay: number) {
        if (!this.isPlaying) return;
        const ev = this.recordedMessages[this.playbackIndex];
        if (!ev) {
            Output.send('== Playback end ==');
            this.stopPlayback();
            return;
        }
        const delay = this.playbackIndex === 0 ? initialDelay :
            this.recordedMessages[this.playbackIndex].timestamp - this.recordedMessages[this.playbackIndex - 1].timestamp;
        this.playbackDelay = delay;
        this.playbackStart = Date.now();
        this.playbackTimeout = window.setTimeout(() => {
            if (!this.isPlaying || this.paused) return;
            this.executeCurrent();
            this.scheduleNext(0);
        }, delay);
    }
}

