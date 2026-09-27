import eventBus from "@modules/core/eventBus";
import {getShellSettings, onShellSettingsChange} from "@modules/core/settings";
import {CanvasExporter} from "mudlet-map-renderer";
import {getEmbeddedMap} from "./embedRegistry";
import type {GmcpCharInfo, GmcpCharState} from "@shared/events";

const HP_MAX = 7;
const THUMB_SIZE = 256;
const THUMB_DEBOUNCE_MS = 500;
const FALLBACK_ARTWORK = "android-chrome-512x512.png";

/**
 * A silent 8-bit mono WAV. Chrome only raises its media notification (lock
 * screen, Android shade, Windows media flyout) for audio that is at least ~5s
 * long and not muted, so the clip is 6s of midpoint samples played at full
 * volume - audible to the browser, inaudible to the player.
 */
export function createSilentWav(seconds = 6, sampleRate = 8000): Uint8Array {
    const samples = seconds * sampleRate;
    const bytes = new Uint8Array(44 + samples);
    const view = new DataView(bytes.buffer);
    const ascii = (offset: number, text: string) => {
        for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
    };
    ascii(0, "RIFF");
    view.setUint32(4, 36 + samples, true);
    ascii(8, "WAVE");
    ascii(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);          // PCM
    view.setUint16(22, 1, true);          // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate, true); // byte rate
    view.setUint16(32, 1, true);          // block align
    view.setUint16(34, 8, true);          // bits per sample
    ascii(36, "data");
    view.setUint32(40, samples, true);
    bytes.fill(128, 44);                  // 8-bit PCM silence
    return bytes;
}

interface SupportTarget {
    support(): void;
}

/**
 * Pretends the client is playing media so the OS media controls show the
 * character: "Arkadia [5/7]" as the title, the character's name as the artist,
 * a snapshot of the map around the player as the cover, and the "next track"
 * button sends the support command ("wesprzyj").
 *
 * Opt-in (shell setting `mediaSession`): the looping silent clip takes the
 * audio focus, which on phones pauses whatever else the player was listening to.
 */
export default class MediaSessionStatus {
    private readonly client: SupportTarget;
    private audio: HTMLAudioElement | null = null;
    private audioUrl: string | null = null;
    private enabled = false;
    private connected = false;
    private hp: number | null = null;
    private character = "";
    private artwork: string | null = null;
    private roomId: number | null = null;
    private thumbTimer: ReturnType<typeof setTimeout> | undefined;
    private gestureListener: (() => void) | null = null;

    constructor(client: SupportTarget) {
        this.client = client;
        if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;

        eventBus.on("gmcp.char.state", (state: GmcpCharState) => {
            if (typeof state?.hp !== "number") return;
            this.hp = state.hp + 1;
            this.updateMetadata();
        });
        eventBus.on("gmcp.char.info", (info: GmcpCharInfo) => {
            if (!info?.name || info.name === this.character) return;
            this.character = info.name;
            this.updateMetadata();
        });
        eventBus.on("enterLocation", (ev) => {
            this.roomId = ev.id;
            this.scheduleThumbnail();
        });
        eventBus.on("client.connect", () => {
            this.connected = true;
            this.sync();
        });
        eventBus.on("client.disconnect", () => {
            this.connected = false;
            this.hp = null;
            this.sync();
        });

        this.enabled = getShellSettings().mediaSession;
        onShellSettingsChange((shell) => {
            if (shell.mediaSession === this.enabled) return;
            this.enabled = shell.mediaSession;
            this.sync();
        });
    }

    private get active() {
        return this.enabled && this.connected;
    }

    private sync() {
        if (this.active) {
            this.start();
        } else {
            this.stop();
        }
    }

    private start() {
        if (!this.audio) {
            const blob = new Blob([createSilentWav() as BlobPart], {type: "audio/wav"});
            this.audioUrl = URL.createObjectURL(blob);
            this.audio = new Audio(this.audioUrl);
            this.audio.loop = true;
        }
        const session = navigator.mediaSession;
        session.setActionHandler("play", () => this.play());
        session.setActionHandler("pause", () => this.pause());
        session.setActionHandler("nexttrack", () => this.client.support());
        this.updateMetadata();
        this.scheduleThumbnail();
        this.play();
    }

    private play() {
        const audio = this.audio;
        if (!audio) return;
        audio.play().then(() => {
            navigator.mediaSession.playbackState = "playing";
        }).catch(() => {
            // Autoplay blocked until the player interacts with the page.
            this.waitForGesture();
        });
    }

    private pause() {
        this.audio?.pause();
        navigator.mediaSession.playbackState = "paused";
    }

    private waitForGesture() {
        if (this.gestureListener) return;
        const listener = () => {
            this.clearGestureListener();
            if (this.active) this.play();
        };
        this.gestureListener = listener;
        window.addEventListener("pointerdown", listener, true);
        window.addEventListener("keydown", listener, true);
    }

    private clearGestureListener() {
        if (!this.gestureListener) return;
        window.removeEventListener("pointerdown", this.gestureListener, true);
        window.removeEventListener("keydown", this.gestureListener, true);
        this.gestureListener = null;
    }

    private stop() {
        this.clearGestureListener();
        clearTimeout(this.thumbTimer);
        if (this.audio) {
            this.audio.pause();
            this.audio.removeAttribute("src");
            this.audio.load();
            this.audio = null;
        }
        if (this.audioUrl) {
            URL.revokeObjectURL(this.audioUrl);
            this.audioUrl = null;
        }
        const session = navigator.mediaSession;
        for (const action of ["play", "pause", "nexttrack"] as const) {
            try {
                session.setActionHandler(action, null);
            } catch {
                // unsupported action
            }
        }
        session.metadata = null;
        session.playbackState = "none";
    }

    private updateMetadata() {
        if (!this.active || typeof MediaMetadata === "undefined") return;
        const title = this.hp !== null ? `Arkadia [${this.hp}/${HP_MAX}]` : "Arkadia";
        const artwork = this.artwork
            ? [{src: this.artwork, sizes: `${THUMB_SIZE}x${THUMB_SIZE}`, type: "image/png"}]
            : [{src: FALLBACK_ARTWORK, sizes: "512x512", type: "image/png"}];
        navigator.mediaSession.metadata = new MediaMetadata({
            title,
            artist: this.character,
            album: "Arkadia",
            artwork,
        });
    }

    private scheduleThumbnail() {
        if (!this.active || this.roomId === null) return;
        const roomId = this.roomId;
        clearTimeout(this.thumbTimer);
        this.thumbTimer = setTimeout(() => {
            const thumb = this.renderThumbnail(roomId);
            if (!thumb) return;
            this.artwork = thumb;
            this.updateMetadata();
        }, THUMB_DEBOUNCE_MS);
    }

    private renderThumbnail(roomId: number): string | null {
        const renderer = getEmbeddedMap()?.renderer;
        if (!renderer) return null;
        try {
            const exported = renderer.export(new CanvasExporter({
                width: THUMB_SIZE,
                height: THUMB_SIZE,
                roomId,
                padding: 4,
                overlays: {position: {roomId}},
            }));
            if (!exported) return null;
            // The map may be drawn on a transparent background (overlay mode);
            // media artwork needs an opaque one.
            const canvas = document.createElement("canvas");
            canvas.width = THUMB_SIZE;
            canvas.height = THUMB_SIZE;
            const ctx = canvas.getContext("2d");
            if (!ctx) return null;
            ctx.fillStyle = "#000";
            ctx.fillRect(0, 0, THUMB_SIZE, THUMB_SIZE);
            ctx.drawImage(exported as unknown as CanvasImageSource, 0, 0);
            return canvas.toDataURL("image/png");
        } catch {
            return null;
        }
    }
}
