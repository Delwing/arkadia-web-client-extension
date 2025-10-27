import {saveRecording, getRecording, getRecordingNames, deleteRecording, RecordedEvent} from './recordingStorage';
import {CommandOptions} from "@client/src/scripts/commandPreserveCaseMode.ts";

export interface RecorderHooks {
    processIncomingData(data: string, options?: { timestamp?: number }): void;

    sendCommand(command: string, echo?: boolean, options?: CommandOptions): void;

    emit(event: string, ...args: any[]): void;

    getCurrentMapLocation?(): number | null;

    setMapLocationSilently?(locationId: number): void;
}

export default class Recorder {
    private isRecording = false;
    private recordedMessages: RecordedEvent[] = [];
    private currentRecordingName: string | null = null;
    private pendingInitialLocationId: number | null = null;
    private playbackTimeout: number | null = null;
    private playbackIndex = 0;
    private playbackDelay = 0;
    private playbackBaseDelay = 0;
    private playbackStart = 0;
    private pausedDelay = 0;
    private isPlaying = false;
    private paused = false;
    private playbackSpeed = 1;

    constructor(private hooks: RecorderHooks) {
    }

    handleIncoming(message: string) {
        if (this.isRecording) {
            this.recordEvent(message, 'in');
        }
    }

    handleOutgoing(message: string) {
        if (this.isRecording) {
            this.recordEvent(message, 'out');
        }
    }

    startRecording(name: string) {
        this.recordedMessages = [];
        this.currentRecordingName = name;
        this.isRecording = true;
        this.pendingInitialLocationId = this.readCurrentLocation();
        this.hooks.emit('recording.start', name);
    }

    async stopRecording(save?: boolean) {
        this.isRecording = false;
        this.pendingInitialLocationId = null;
        if (save && this.currentRecordingName) {
            await saveRecording(this.currentRecordingName, this.recordedMessages);
        }
        this.hooks.emit('recording.stop', save);
        this.currentRecordingName = null;
    }

    isRecordingActive() {
        return this.isRecording;
    }

    getCurrentRecordingName() {
        return this.currentRecordingName;
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
        this.playbackDelay = 0;
        this.playbackBaseDelay = 0;
        this.pausedDelay = 0;
        this.hooks.emit('playback.stop');
    }

    pausePlayback() {
        if (!this.isPlaying || this.paused) return;
        if (this.playbackTimeout !== null) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
            const elapsed = Date.now() - this.playbackStart;
            const elapsedBase = elapsed * this.playbackSpeed;
            const remainingBase = Math.max(0, this.playbackBaseDelay - elapsedBase);
            this.pausedDelay = remainingBase;
        } else {
            this.pausedDelay = 0;
        }
        this.paused = true;
        this.hooks.emit('playback.pause');
    }

    resumePlayback() {
        if (!this.isPlaying || !this.paused) return;
        this.paused = false;
        this.scheduleNext(this.pausedDelay, true);
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

    getRecordedMessagesSince(durationMs: number) {
        const cutoff = Date.now() - durationMs;
        return this.recordedMessages.filter(event => typeof event.timestamp === 'number' && event.timestamp >= cutoff);
    }

    setRecordedMessages(events: RecordedEvent[]) {
        this.recordedMessages = events.slice();
    }

    replayRecordedMessages() {
        if (this.recordedMessages.length === 0) return;
        this.stopPlayback();
        this.applyInitialLocation();
        this.isPlaying = true;
        this.hooks.emit('playback.start');
        this.hooks.emit("message", '== Playback start ==');
        this.recordedMessages.forEach(ev => {
            const timestamp = typeof ev.timestamp === 'number' ? ev.timestamp : Date.now();
            if (ev.direction === 'in') {
                this.hooks.processIncomingData(ev.message, { timestamp });
            } else {
                this.hooks.emit("message", '→ ' + ev.message, undefined, timestamp);
            }
        });
        this.hooks.emit("message", '== Playback end ==');
        this.stopPlayback();
    }

    replayRecordedMessagesTimed() {
        if (this.recordedMessages.length === 0) return;
        this.stopPlayback();
        this.applyInitialLocation();
        this.isPlaying = true;
        this.paused = false;
        this.playbackIndex = 0;
        this.hooks.emit('playback.start', this.recordedMessages.length);
        this.hooks.emit("message", '== Playback start ==');
        this.hooks.emit('playback.index', 0, this.recordedMessages.length);
        this.scheduleNext(0);
    }

    setPlaybackSpeed(speed: number) {
        const normalized = Number.isFinite(speed) && speed > 0 ? speed : 1;
        const previousSpeed = this.playbackSpeed;
        if (previousSpeed === normalized) {
            this.hooks.emit('playback.speed', this.playbackSpeed);
            return;
        }
        this.playbackSpeed = normalized;

        if (this.isPlaying) {
            if (this.paused) {
                // pausedDelay already stores the base delay until the next event
            } else if (this.playbackTimeout !== null) {
                const elapsed = Date.now() - this.playbackStart;
                const elapsedBase = elapsed * previousSpeed;
                const remainingBase = Math.max(0, this.playbackBaseDelay - elapsedBase);
                clearTimeout(this.playbackTimeout);
                this.playbackTimeout = null;
                this.scheduleNext(remainingBase, true);
            }
        }

        this.hooks.emit('playback.speed', this.playbackSpeed);
    }

    getPlaybackSpeed() {
        return this.playbackSpeed;
    }

    private playEvent(ev: RecordedEvent) {
        const timestamp = typeof ev.timestamp === 'number' ? ev.timestamp : Date.now();
        if (ev.direction === 'in') {
            this.hooks.processIncomingData(ev.message, { timestamp });
        } else {
            this.hooks.emit("message", '→ ' + ev.message, undefined, timestamp);
            window.clientExtension.sendCommand(ev.message, false);
            this.hooks.sendCommand(ev.message, false);
        }
    }

    private applyInitialLocation() {
        if (typeof this.hooks.setMapLocationSilently !== 'function') {
            return;
        }
        const initialEvent = this.recordedMessages.find(event => typeof event.initialLocationId === 'number');
        const fallbackEvent = this.recordedMessages.find(event => typeof event.locationId === 'number');
        const locationId = initialEvent?.initialLocationId ?? fallbackEvent?.locationId;
        if (typeof locationId === 'number') {
            this.hooks.setMapLocationSilently(locationId);
        }
    }

    private recordEvent(message: string, direction: 'in' | 'out') {
        const event: RecordedEvent = {
            message,
            timestamp: Date.now(),
            direction
        };
        const currentLocation = this.readCurrentLocation();
        if (typeof this.pendingInitialLocationId === 'number') {
            event.initialLocationId = this.pendingInitialLocationId;
            if (typeof currentLocation !== 'number') {
                event.locationId = this.pendingInitialLocationId;
            }
            this.pendingInitialLocationId = null;
        }
        if (typeof currentLocation === 'number') {
            event.locationId = currentLocation;
        }
        if (this.recordedMessages.length === 0 && typeof event.initialLocationId !== 'number' && typeof event.locationId === 'number') {
            event.initialLocationId = event.locationId;
        }
        this.recordedMessages.push(event);
    }

    private readCurrentLocation(): number | null {
        if (typeof this.hooks.getCurrentMapLocation !== 'function') {
            return null;
        }
        const location = this.hooks.getCurrentMapLocation();
        return typeof location === 'number' ? location : null;
    }

    private executeCurrent() {
        const ev = this.recordedMessages[this.playbackIndex];
        if (!ev) {
            this.hooks.emit("message", '== Playback end ==');
            this.stopPlayback();
            return;
        }
        this.playEvent(ev);
        this.playbackIndex++;
        this.hooks.emit('playback.index', this.playbackIndex, this.recordedMessages.length);
    }

    private scheduleNext(initialDelay: number, overrideDelay = false) {
        if (!this.isPlaying) return;
        const ev = this.recordedMessages[this.playbackIndex];
        if (!ev) {
            this.hooks.emit("message", '== Playback end ==');
            this.stopPlayback();
            return;
        }
        let baseDelay: number;
        if (this.playbackIndex === 0 || overrideDelay) {
            baseDelay = initialDelay;
        } else {
            const currentTimestamp = typeof ev.timestamp === 'number' ? ev.timestamp : Date.now();
            const previous = this.recordedMessages[this.playbackIndex - 1];
            const previousTimestamp = typeof previous?.timestamp === 'number' ? previous.timestamp : currentTimestamp;
            baseDelay = currentTimestamp - previousTimestamp;
        }
        if (!Number.isFinite(baseDelay) || baseDelay < 0) {
            baseDelay = 0;
        }
        const adjustedDelay = baseDelay / this.playbackSpeed;
        this.playbackBaseDelay = baseDelay;
        this.playbackDelay = adjustedDelay;
        this.playbackStart = Date.now();
        this.playbackTimeout = window.setTimeout(() => {
            if (!this.isPlaying || this.paused) return;
            this.executeCurrent();
            this.scheduleNext(0);
        }, Math.max(0, adjustedDelay));
    }
}

