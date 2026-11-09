import { getHostPort, setHostPort, type HostPort } from '@client/ports';

describe('host port', () => {
    let installed: HostPort;

    beforeEach(() => {
        installed = getHostPort();
    });

    afterEach(() => setHostPort(installed));

    test('a UI-installed host is the one the client reads', () => {
        const host = { ...installed, copyText: vi.fn(() => Promise.resolve()) };
        setHostPort(host);
        void getHostPort().copyText('x');
        expect(host.copyText).toHaveBeenCalledWith('x');
    });
});
