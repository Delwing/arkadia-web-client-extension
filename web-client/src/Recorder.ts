import {saveRecording, getRecording, getRecordingNames, deleteRecording, RecordedEvent} from './recordingStorage';
import WebSocketTransportAdapter from "@client/src/transport/websocket-adapter.ts";
import appEventBus from "@client/src/events/app-event-bus.ts";

export default class Recorder {
    private webSocketAdapter: WebSocketTransportAdapter;
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

    constructor(websocketAdapter: WebSocketTransportAdapter) {
        this.webSocketAdapter = websocketAdapter;
        this.webSocketAdapter.messages$.subscribe((message) => {
            switch (message.type) {
                case "rawData":
                    this.handleIncoming(message.payload)
                    break
                case "command":
                    if (message.payload.kind == "text") {
                        this.handleOutgoing(message.payload.payload)
                    }
                    break
            }
        })
    }

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
        appEventBus.emit('recording.start', name);
    }

    async stopRecording(save?: boolean) {
        this.isRecording = false;
        if (save && this.currentRecordingName) {
            await saveRecording(this.currentRecordingName, this.recordedMessages);
        }
        appEventBus.emit('recording.stop', save);
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
        appEventBus.emit('playback.stop');
    }

    pausePlayback() {
        if (!this.isPlaying || this.paused) return;
        if (this.playbackTimeout !== null) {
            clearTimeout(this.playbackTimeout);
            this.playbackTimeout = null;
            this.pausedDelay = Math.max(0, this.playbackDelay - (Date.now() - this.playbackStart));
        }
        this.paused = true;
        appEventBus.emit('playback.pause');
    }

    resumePlayback() {
        if (!this.isPlaying || !this.paused) return;
        this.paused = false;
        this.scheduleNext(this.pausedDelay);
        appEventBus.emit('playback.resume');
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
        appEventBus.emit('playback.start');
        appEventBus.emit('message', {text: '== Playback start ==', type: 'raw'});
        this.recordedMessages.forEach(ev => {
            if (ev.direction === 'in') {
                this.webSocketAdapter.messages$.next({type: 'data', payload: ev.message});
            } else {
                appEventBus.emit('message', {text: '→ ' + ev.message, type: 'raw'});
            }
        });
        appEventBus.emit('message', {text: '== Playback end ==', type: 'raw'});
        this.stopPlayback();
    }

    replayRecordedMessagesTimed() {
        if (this.recordedMessages.length === 0) return;
        this.stopPlayback();
        this.isPlaying = true;
        this.paused = false;
        this.playbackIndex = 0;
        appEventBus.emit('playback.start', this.recordedMessages.length);
        appEventBus.emit("message", {text: "== Playback start ==", type: "raw"});
        appEventBus.emit('playback.index', {current: 0, total: this.recordedMessages.length});
        this.scheduleNext(0);
    }

    private playEvent(ev: RecordedEvent) {
        if (ev.direction === 'in') {
            this.webSocketAdapter.messages$.next({type: 'data', payload: ev.message});
        } else {
            appEventBus.emit('message', {text: '→ ' + ev.message, type: 'command'});
            //window.clientExtension.sendCommand(ev.message, false); //TODO send command via aliases
            //this.hooks.send(ev.message, false);
        }
    }

    private executeCurrent() {
        const ev = this.recordedMessages[this.playbackIndex];
        if (!ev) {
            appEventBus.emit('message', {text: '== Playback end ==', type: 'raw'});
            this.stopPlayback();
            return;
        }
        this.playEvent(ev);
        this.playbackIndex++;
        appEventBus.emit('playback.index', {current: this.playbackIndex, total: this.recordedMessages.length});
    }

    private scheduleNext(initialDelay: number) {
        if (!this.isPlaying) return;
        const ev = this.recordedMessages[this.playbackIndex];
        if (!ev) {

            appEventBus.emit('message', {text: '== Playback end ==', type: 'raw'});
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

