import {base64Codec, binaryCodec, framedCodec, selectCodec} from '@shared/socket/transport.ts';

/** Build a proxy frame the way proxy/frame.go does. */
function frame(kind: number, atMs: number, payload: string): ArrayBuffer {
    const buf = new ArrayBuffer(9 + payload.length);
    const view = new DataView(buf);
    view.setUint8(0, kind);
    view.setBigUint64(1, BigInt(atMs));
    const bytes = new Uint8Array(buf, 9);
    for (let i = 0; i < payload.length; i++) {
        bytes[i] = payload.charCodeAt(i) & 0xff;
    }
    return buf;
}

const FRAME_DATA = 0x01;
const FRAME_CONTROL = 0x02;

describe('framedCodec', () => {
    it('recovers the payload and the time the server produced it', () => {
        const at = 1787851952000;
        const decoded = framedCodec.decodeFrame!(frame(FRAME_DATA, at, 'Jestes w lesie.\r\n'));

        expect(decoded.bytes).toBe('Jestes w lesie.\r\n');
        expect(decoded.at).toBe(at);
        expect(decoded.control).toBeUndefined();
    });

    it('keeps high bytes intact, so telnet and MCCP survive the trip', () => {
        // IAC WILL GMCP — mangling these breaks negotiation rather than a line of text.
        const payload = '\xFF\xFB\xC9';
        const decoded = framedCodec.decodeFrame!(frame(FRAME_DATA, 1, payload));

        expect(decoded.bytes).toBe(payload);
    });

    it('parses a control frame and yields no game bytes', () => {
        const body = JSON.stringify({type: 'attached', resumed: true, replayedBytes: 74, droppedBytes: 0});
        const decoded = framedCodec.decodeFrame!(frame(FRAME_CONTROL, 5, body));

        expect(decoded.bytes).toBe('');
        expect(decoded.control).toEqual({
            type: 'attached',
            resumed: true,
            replayedBytes: 74,
            droppedBytes: 0,
        });
    });

    it('ignores a frame type it does not know rather than rendering it', () => {
        const decoded = framedCodec.decodeFrame!(frame(0x7f, 1, 'from a newer proxy'));

        expect(decoded.bytes).toBe('');
    });

    it('survives a truncated frame', () => {
        expect(framedCodec.decodeFrame!(new ArrayBuffer(3)).bytes).toBe('');
    });

    it('sends raw bytes, since input needs no timestamp', () => {
        const encoded = framedCodec.encode('polnoc\r\n');

        expect(encoded).toBeInstanceOf(Uint8Array);
        expect(Array.from(encoded as Uint8Array)).toEqual(
            Array.from('polnoc\r\n', c => c.charCodeAt(0)),
        );
    });

    it('exposes the payload through the plain decode path too', () => {
        expect(framedCodec.decode(frame(FRAME_DATA, 1, 'witaj'))).toBe('witaj');
    });
});

describe('selectCodec', () => {
    it('picks base64 for the native endpoint and binary for a plain proxy', () => {
        expect(selectCodec(false)).toBe(base64Codec);
        expect(selectCodec(true)).toBe(binaryCodec);
    });

    it('picks the framed codec only when the session proxy is in play', () => {
        expect(selectCodec(true, true)).toBe(framedCodec);
        expect(selectCodec(true, false)).toBe(binaryCodec);
    });

    it('leaves the plain codecs without a frame decoder, so callers fall back', () => {
        expect(base64Codec.decodeFrame).toBeUndefined();
        expect(binaryCodec.decodeFrame).toBeUndefined();
    });
});
