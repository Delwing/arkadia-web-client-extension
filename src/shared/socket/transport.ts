// WebSocket wire-format strategy for the telnet bridge.
//
// The MUD pipeline works on Latin-1 byte-strings (one JS char == one byte) —
// that's what `atob` yields and what `stripTelnetSequences`/`decodeUtf8`
// consume. A TransportCodec maps that byte-string to and from the actual
// WebSocket frame payload, so the rest of MudClient never has to care which
// wire format is in use.
//
// Two strategies, picked once at connect time (see selectCodec):
//   - base64Codec: text frames carrying base64. The native Arkadia /wss
//     endpoint speaks this and we don't control it.
//   - binaryCodec: raw binary frames. The telnet proxy worker speaks this;
//     skipping base64 transcoding on every frame is the bulk of the saved
//     CPU on both ends.

/** What the session proxy reports when a client attaches. */
export interface SessionControl {
    type: string;
    sessionAgeMs?: number;
    replayedBytes?: number;
    droppedBytes?: number;
    resumed?: boolean;
    /**
     * The game ended this session while nobody was attached — idled out, quit, or the
     * server restarted. Distinct from the proxy losing the session, and the difference
     * is the whole answer to "what happened while I was away": the replay just handed
     * over carries the game's own parting words. Reconnecting on top of that would
     * bury the explanation under a fresh login banner.
     */
    upstreamClosed?: boolean;
    closeReason?: string;
}

/** One decoded inbound frame, with whatever metadata the wire format carried. */
export interface DecodedFrame {
    /** Game bytes as a Latin-1 byte-string. Empty for a control frame. */
    bytes: string;
    /**
     * When the *server* produced these bytes, as epoch ms — not when we read them.
     * Only the session proxy knows this, and only it can: replayed output describes
     * things that happened while the tab was frozen, so a client stamping its own
     * clock would date every one of them to the moment the player came back.
     */
    at?: number;
    /** Session metadata rather than game output. */
    control?: SessionControl;
}

export interface TransportCodec {
    /** Decode an incoming frame payload into a Latin-1 byte-string. */
    decode(frame: string | ArrayBuffer): string;
    /** Encode a Latin-1 byte-string into a frame payload to send. */
    encode(bytes: string): string | Uint8Array;
    /**
     * Richer decode for wire formats that carry more than bytes. Absent on the plain
     * codecs, so callers fall back to {@link decode}.
     */
    decodeFrame?(frame: string | ArrayBuffer): DecodedFrame;
}

/**
 * Raw bytes -> Latin-1 byte-string (charCode === byte for 0..255), exactly what
 * atob() used to yield for the downstream telnet/MCCP pipeline.
 * NB: TextDecoder('latin1') is *not* equivalent — that label maps to
 * windows-1252 and mangles bytes 0x80-0x9F, so we map by hand. Chunked to stay
 * within String.fromCharCode's argument limit on large frames.
 */
function bytesToLatin1(bytes: Uint8Array): string {
    let binary = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return binary;
}

/** Latin-1 byte-string -> raw bytes (the inverse of bytesToLatin1). */
function latin1ToBytes(str: string): Uint8Array {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xff;
    }
    return bytes;
}

/** Legacy strategy: base64 over text frames. Used by the native /wss endpoint. */
export const base64Codec: TransportCodec = {
    decode(frame) {
        // A binary frame here would be a misbehaving server; ignore it rather
        // than feed garbage downstream.
        return typeof frame === "string" ? atob(frame) : "";
    },
    encode(bytes) {
        return btoa(bytes);
    },
};

/** Raw binary strategy: the byte-string maps 1:1 to/from frame bytes. */
export const binaryCodec: TransportCodec = {
    decode(frame) {
        // Tolerate a stray text frame by passing it through unchanged.
        return typeof frame === "string" ? frame : bytesToLatin1(new Uint8Array(frame));
    },
    encode(bytes) {
        return latin1ToBytes(bytes);
    },
};

// Frame types on the session proxy's wire, mirroring proxy/frame.go.
const FRAME_DATA = 0x01;
const FRAME_CONTROL = 0x02;
const FRAME_HEADER_LEN = 9;

/**
 * The session proxy's format: `[type][int64 big-endian ms][payload]`.
 *
 * The header exists for one reason. The proxy holds the game connection while a phone's
 * tab is frozen, so on return it replays output describing things that happened minutes
 * ago. Raw bytes cannot say when, and a client that stamps `Date.now()` while processing
 * a replayed line dates it to the moment the browser woke up — which is wrong for every
 * counter, timer and progress tracker in the client.
 *
 * Outbound stays raw: player input needs no timestamp, so the send path is unchanged.
 */
export const framedCodec: TransportCodec = {
    decode(frame) {
        return framedCodec.decodeFrame!(frame).bytes;
    },
    encode(bytes) {
        return latin1ToBytes(bytes);
    },
    decodeFrame(frame): DecodedFrame {
        if (typeof frame === "string") {
            // A text frame is not something this proxy sends; treat it as game bytes
            // rather than dropping it, so an unexpected server can still be read.
            return {bytes: frame};
        }
        const view = new DataView(frame);
        if (view.byteLength < FRAME_HEADER_LEN) {
            return {bytes: ""};
        }
        const kind = view.getUint8(0);
        // Milliseconds since the epoch fit in a double exactly for any date we care
        // about, so the BigInt is only a transport detail.
        const at = Number(view.getBigUint64(1));
        const payload = new Uint8Array(frame, FRAME_HEADER_LEN);

        if (kind === FRAME_CONTROL) {
            try {
                return {bytes: "", at, control: JSON.parse(bytesToLatin1(payload)) as SessionControl};
            } catch {
                return {bytes: "", at};
            }
        }
        if (kind !== FRAME_DATA) {
            // A frame type from a newer proxy. Ignoring it beats rendering it.
            return {bytes: "", at};
        }
        return {bytes: bytesToLatin1(payload), at};
    },
};

/**
 * Pick the wire strategy. The telnet proxy worker is binary-only; the native
 * Arkadia endpoint is base64; the session proxy adds a header carrying arrival
 * times. There's no runtime handshake — the proxy doesn't echo a subprotocol — so
 * the choice is driven entirely by which endpoint we're dialing.
 */
export function selectCodec(useBinary: boolean, framed = false): TransportCodec {
    if (framed) return framedCodec;
    return useBinary ? binaryCodec : base64Codec;
}
