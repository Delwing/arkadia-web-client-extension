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

export interface TransportCodec {
    /** Decode an incoming frame payload into a Latin-1 byte-string. */
    decode(frame: string | ArrayBuffer): string;
    /** Encode a Latin-1 byte-string into a frame payload to send. */
    encode(bytes: string): string | Uint8Array;
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

/**
 * Pick the wire strategy. The telnet proxy worker is binary-only; the native
 * Arkadia endpoint is base64. There's no runtime handshake — the proxy doesn't
 * echo a subprotocol — so the choice is driven entirely by which endpoint we're
 * dialing.
 */
export function selectCodec(useBinary: boolean): TransportCodec {
    return useBinary ? binaryCodec : base64Codec;
}
