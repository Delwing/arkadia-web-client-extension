import arkadiaClient from '../src/ArkadiaClient';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pako: any = require('../public/pako.min.js');

const GMCP_COMMAND_CODE = 201;

const toCharCodes = (value: string) => value.split('').map(char => char.charCodeAt(0));

describe('ArkadiaClient MCCP handling', () => {
  let client: any;
  let originalMccp: boolean;
  let originalInflator: any;

  beforeEach(() => {
    client = arkadiaClient as any;
    originalMccp = client.mccp;
    originalInflator = client.readInflator;
    client.mccp = true;
    client.readInflator = new (pako as any).Inflate();
  });

  afterEach(() => {
    client.mccp = originalMccp;
    client.readInflator = originalInflator;
    jest.restoreAllMocks();
  });

  test('decompresses MCCP data followed by GMCP subnegotiation without error', () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const processIncoming = jest.spyOn(client, 'processIncomingData').mockImplementation(() => {});
    const recordIncoming = jest.spyOn(client, 'recordIncoming').mockImplementation(() => {});

    const sampleText = 'Test MCCP output';
    const compressed = pako.deflate(sampleText);

    const gmcpPayload = 'core.hello {}';
    const gmcpBytes = [
      0xFF,
      0xFA,
      GMCP_COMMAND_CODE,
      ...toCharCodes(gmcpPayload),
      0xFF,
      0xF0,
    ];

    const frameBytes = new Uint8Array(compressed.length + gmcpBytes.length);
    frameBytes.set(compressed, 0);
    frameBytes.set(gmcpBytes, compressed.length);

    const base64Frame = btoa(String.fromCharCode(...Array.from(frameBytes)));

    client.handleSocketMessage(base64Frame);

    const loggedMccpError = consoleError.mock.calls.some(call =>
      call.some((arg: unknown) => typeof arg === 'string' && arg.includes('MCCP decompression error')),
    );

    expect(loggedMccpError).toBe(false);
    expect(processIncoming).toHaveBeenCalledWith(sampleText);
    expect(recordIncoming).toHaveBeenCalledWith(sampleText);
  });
});
