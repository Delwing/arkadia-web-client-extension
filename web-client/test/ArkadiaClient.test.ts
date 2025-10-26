import {ArkadiaClient} from '../src/ArkadiaClient';

const originalInflate = globalThis.pako.Inflate;
const COMPRESSED_SAMPLE = [120, 156, 243, 200, 84, 4, 0, 1, 206, 0, 211];
const MCCP_NEGOTIATION = [255, 250, 86, 1, 255, 240];
const GMCP_COMMAND = 201;

const toBinaryString = (bytes: number[]): string => {
    return bytes.map(byte => String.fromCharCode(byte)).join('');
};

afterEach(() => {
    globalThis.pako.Inflate = originalInflate;
    jest.restoreAllMocks();
});

describe('ArkadiaClient MCCP negotiation', () => {
    test('enables MCCP and inflates trailing data in mixed frames', () => {
        const pushMock = jest.fn(function (this: any, bytes: Uint8Array | number[], mode: number) {
            const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            expect(Array.from(byteArray).slice(0, 2)).toEqual([120, 156]);
            expect(mode).toBe(2);
            this.err = 0;
            this.msg = '';
            this.result = new Uint8Array([72, 105, 33]);
        });

        const inflateInstance = {
            err: 0,
            msg: '',
            result: new Uint8Array(),
            chunks: [] as unknown[],
            ended: false,
            push: pushMock,
        };

        const inflateFactory = jest.fn(() => inflateInstance);
        globalThis.pako.Inflate = inflateFactory as any;

        const client = new ArkadiaClient();
        const frameBytes = [...MCCP_NEGOTIATION, ...COMPRESSED_SAMPLE];
        const binary = toBinaryString(frameBytes);
        const decoded = (client as any).decodeIncomingData(binary);

        expect(decoded).toBe('Hi!');
        expect((client as any).mccp).toBe(true);
        expect(pushMock).toHaveBeenCalledTimes(1);
        expect(Array.from(pushMock.mock.calls[0][0])).toEqual([120, 156, 243, 200, 84, 4, 0, 1, 206, 0, 211]);
        expect(pushMock.mock.calls[0][1]).toBe(2);
        expect(inflateFactory.mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    test('preserves plaintext prior to MCCP negotiation', () => {
        const pushMock = jest.fn(function (this: any, bytes: Uint8Array | number[]) {
            const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            expect(Array.from(byteArray)).toEqual([120, 156, 243, 200, 84, 4, 0, 1, 206, 0, 211]);
            this.err = 0;
            this.msg = '';
            this.result = new Uint8Array([72, 105, 33]);
        });

        const inflateInstance = {
            err: 0,
            msg: '',
            result: new Uint8Array(),
            chunks: [] as unknown[],
            ended: false,
            push: pushMock,
        };

        const inflateFactory = jest.fn(() => inflateInstance);
        globalThis.pako.Inflate = inflateFactory as any;

        const client = new ArkadiaClient();
        const prefix = [79, 107, 32];
        const frameBytes = [...prefix, ...MCCP_NEGOTIATION, ...COMPRESSED_SAMPLE];
        const binary = toBinaryString(frameBytes);
        const decoded = (client as any).decodeIncomingData(binary);

        expect(decoded).toBe('Ok Hi!');
        expect((client as any).mccp).toBe(true);
        expect(pushMock).toHaveBeenCalledTimes(1);
    });

    test('buffers GMCP negotiation split across frames without corrupting MCCP stream', () => {
        const pushMock = jest.fn(function (this: any, bytes: Uint8Array | number[]) {
            const byteArray = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
            expect(Array.from(byteArray).slice(0, 2)).toEqual([120, 156]);
            this.err = 0;
            this.msg = '';
            this.result = new Uint8Array([72, 105, 33]);
        });

        const inflateInstance = {
            err: 0,
            msg: '',
            result: new Uint8Array(),
            chunks: [] as unknown[],
            ended: false,
            push: pushMock,
        };

        const inflateFactory = jest.fn(() => inflateInstance);
        globalThis.pako.Inflate = inflateFactory as any;

        const client = new ArkadiaClient();

        // Enable MCCP without payload
        (client as any).decodeIncomingData(toBinaryString(MCCP_NEGOTIATION));
        expect((client as any).mccp).toBe(true);
        pushMock.mockClear();

        const gmcpPayload = 'core.ping {}';
        const gmcpBytes = gmcpPayload.split('').map(char => char.charCodeAt(0));
        const gmcpPart1 = [255, 250, GMCP_COMMAND, ...gmcpBytes.slice(0, 5)];
        const gmcpPart2 = [...gmcpBytes.slice(5), 255, 240];

        const firstResult = (client as any).decodeIncomingData(toBinaryString(gmcpPart1));
        expect(firstResult).toBe('');
        expect(pushMock).not.toHaveBeenCalled();
        expect(((client as any).pendingTelnetBytes || []).length).toBeGreaterThan(0);

        const secondFrame = [...gmcpPart2, ...COMPRESSED_SAMPLE];
        const secondResult = (client as any).decodeIncomingData(toBinaryString(secondFrame));

        expect(secondResult).toBe('Hi!');
        expect(pushMock).toHaveBeenCalledTimes(1);
        expect(Array.from(pushMock.mock.calls[0][0])).toEqual(COMPRESSED_SAMPLE);
        expect(((client as any).pendingTelnetBytes || []).length).toBe(0);
    });
});
