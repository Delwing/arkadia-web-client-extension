import {eventNow} from "../eventClock";
export interface RecordedEvent {
    message: string;
    timestamp: number;
    direction: 'in' | 'out';
    locationId?: number;
    initialLocationId?: number;
}

export interface RecorderStorage {
    saveRecording(id: string, events: RecordedEvent[]): Promise<void>;
    getRecording(id: string): Promise<RecordedEvent[] | null>;
    getRecordingNames(): Promise<string[]>;
    deleteRecording(id: string): Promise<void>;
}

export interface RecorderHooks<CommandOptions = unknown> {
    processIncomingData(data: string, options?: { timestamp?: number }): void;
    sendCommand(command: string, echo?: boolean, options?: CommandOptions): void;
    emit(event: string, ...args: any[]): void;
    notifySendCommand?(command: string, echo?: boolean, options?: CommandOptions): void;
}

export interface RecorderEventBus {
    on(event: string, listener: (...args: any[]) => void): (() => void) | void;
    emit(event: string, ...args: any[]): void;
}

export default class Recorder<CommandOptions = unknown> {
    private isRecording = false;
    private recordedMessages: RecordedEvent[] = [];
    private currentRecordingName: string | null = null;
    private pendingInitialLocationId: number | null = null;
    private playbackTimeout: number | null = null;
    private playbackIndex = 0;
    private playbackBaseDelay = 0;
    private playbackStart = 0;
    private pausedDelay = 0;
    private isPlaying = false;
    private paused = false;
    private playbackSpeed = 1;
    private loopEnabled = false;
    private loopStartIndex: number | null = null;
    private loopEndIndex: number | null = null;
    private currentMapRoomId: number | null = null;

    constructor(
        private readonly hooks: RecorderHooks<CommandOptions>,
        private readonly storage: RecorderStorage,
        eventBus?: RecorderEventBus,
    ) {
        eventBus?.on('enterLocation', (ev: { id: number }) => {
            this.currentMapRoomId = ev.id;
        });
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
            await this.storage.saveRecording(this.currentRecordingName, this.recordedMessages);
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
        const data = await this.storage.getRecording(name);
        this.recordedMessages = data || [];
        this.currentRecordingName = name;

        // Start playback in paused state
        if (this.recordedMessages.length > 0) {
            this.applyInitialLocation();
            this.isPlaying = true;
            this.paused = true;
            this.playbackIndex = 0;
            this.hooks.emit('playback.start', this.recordedMessages.length);
            this.hooks.emit('playback.pause');
            this.hooks.emit('playback.index', 0, this.recordedMessages.length);
        }

        this.hooks.emit('recording.loaded', {
            name,
            length: this.recordedMessages.length
        });
    }

    listRecordings() {
        return this.storage.getRecordingNames();
    }

    deleteRecording(name: string) {
        return this.storage.deleteRecording(name);
    }

    stopPlayback() {
        if (this.playbackTimeout !== null) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
        }
        this.isPlaying = false;
        this.paused = false;
        this.playbackIndex = 0;
        this.playbackBaseDelay = 0;
        this.pausedDelay = 0;
        this.loopEnabled = false;
        this.loopStartIndex = null;
        this.loopEndIndex = null;
        this.hooks.emit('playback.stop');
    }

    pausePlayback() {
        if (!this.isPlaying || this.paused) return;
        if (this.playbackTimeout !== null) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
            const elapsed = Date.now() - this.playbackStart;
            const elapsedBase = elapsed * this.playbackSpeed;
            this.pausedDelay = Math.max(0, this.playbackBaseDelay - elapsedBase);
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
            setTimeout(() => {
            const timestamp = typeof ev.timestamp === 'number' ? ev.timestamp : Date.now();
            if (ev.direction === 'in') {
                this.hooks.processIncomingData(ev.message, { timestamp });
            } else {
                this.hooks.emit("message", '→ ' + ev.message, undefined, timestamp);
                this.hooks.notifySendCommand?.(ev.message, false);
                this.hooks.sendCommand(ev.message, false);
            }
            }, 0)
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

    startOver() {
        if (!this.isPlaying || this.recordedMessages.length === 0) return;
        if (this.playbackTimeout !== null) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
        }
        this.applyInitialLocation();
        this.playbackIndex = 0;
        this.paused = false;
        this.hooks.emit("message", '== Playback restart ==');
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

    setLoopStart() {
        if (!this.isPlaying) return;
        this.loopStartIndex = this.playbackIndex;
        this.hooks.emit('playback.loop.updated', {
            start: this.loopStartIndex,
            end: this.loopEndIndex,
            enabled: this.loopEnabled
        });
    }

    setLoopEnd() {
        if (!this.isPlaying) return;
        this.loopEndIndex = this.playbackIndex;
        this.hooks.emit('playback.loop.updated', {
            start: this.loopStartIndex,
            end: this.loopEndIndex,
            enabled: this.loopEnabled
        });
    }

    toggleLoop() {
        if (!this.isPlaying) return;
        this.loopEnabled = !this.loopEnabled;
        this.hooks.emit('playback.loop.updated', {
            start: this.loopStartIndex,
            end: this.loopEndIndex,
            enabled: this.loopEnabled
        });
    }

    clearLoop() {
        this.loopEnabled = false;
        this.loopStartIndex = null;
        this.loopEndIndex = null;
        this.hooks.emit('playback.loop.updated', {
            start: null,
            end: null,
            enabled: false
        });
    }

    getLoopState() {
        return {
            enabled: this.loopEnabled,
            start: this.loopStartIndex,
            end: this.loopEndIndex
        };
    }

    private playEvent(ev: RecordedEvent) {
        const timestamp = typeof ev.timestamp === 'number' ? ev.timestamp : Date.now();
        if (ev.direction === 'in') {
            this.hooks.processIncomingData(ev.message, { timestamp });
        } else {
            this.hooks.emit("message", '→ ' + ev.message, undefined, timestamp);
            this.hooks.notifySendCommand?.(ev.message, false);
            this.hooks.sendCommand(ev.message, false);
        }
        this.hooks.emit('playback.event', ev);
    }

    private applyInitialLocation() {
        const initialEvent = this.recordedMessages.find(event => typeof event.initialLocationId === 'number');
        const fallbackEvent = this.recordedMessages.find(event => typeof event.locationId === 'number');
        const locationId = initialEvent?.initialLocationId ?? fallbackEvent?.locationId;
        if (typeof locationId === 'number') {
            this.hooks.emit('renderMapLocation', { locationId });
        }
    }

    private recordEvent(message: string, direction: 'in' | 'out') {
        // Filter out ping events
        if (message === 'ÿûñÿúÉcore.ping {}ÿð' || message === 'ÿûñ') {
            return;
        }

        const event: RecordedEvent = {
            message,
            timestamp: eventNow(),
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
        return this.currentMapRoomId;
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

        // Check if we've reached the loop end point
        if (this.loopEnabled &&
            this.loopStartIndex !== null &&
            this.loopEndIndex !== null &&
            this.playbackIndex > this.loopEndIndex) {
            // Reset to loop start and apply initial location
            this.playbackIndex = this.loopStartIndex;
            this.applyInitialLocation();
            this.hooks.emit('playback.index', this.playbackIndex, this.recordedMessages.length);
        }
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
        this.playbackStart = Date.now();

        // Emit timer info for UI countdown
        this.hooks.emit('playback.timer', {
            delay: Math.max(0, adjustedDelay),
            startTime: this.playbackStart
        });

        this.playbackTimeout = window.setTimeout(() => {
            if (!this.isPlaying || this.paused) return;
            this.executeCurrent();
            this.scheduleNext(0);
        }, Math.max(0, adjustedDelay));
    }
}
