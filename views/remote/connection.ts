/**
 * The phone's side of the link: reach a PC it has a pairing code for and turn
 * what it sends into callbacks. No DOM here; RemoteApp renders.
 */

import { connectToHost, type RemoteChannel } from "@modules/remoteControl/peerTransport.ts";
import { parseHostMessage, type RemoteMessage, type RemoteState } from "@modules/remoteControl/protocol.ts";
import { prefs } from "./prefs";

export interface HostEntry {
    hostId: string;
    /** The character last played there, once known. */
    character: string | null;
}

export type LinkStatus =
    | { kind: 'starting' }
    | { kind: 'unavailable'; reason: string }
    | { kind: 'idle' }
    | { kind: 'connecting'; hostId: string }
    | { kind: 'connected'; hostId: string }
    /** `byHost`: the PC closed it on purpose, so do not reconnect on its own. */
    | { kind: 'lost'; hostId: string; reason: string; byHost?: boolean };

export interface LinkEvents {
    hosts(hosts: HostEntry[]): void;
    status(status: LinkStatus): void;
    hello(state: RemoteState, backlog: string[]): void;
    state(patch: Partial<RemoteState>): void;
    output(html: string): void;
}

function lostReason(error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error);
    if (reason === 'peer-unavailable' || reason === 'timeout') {
        return 'Komputer nie odpowiada. Włącz pilota na komputerze (/pilot) - a jeśli wygenerowano nowy kod, zeskanuj go jeszcze raz.';
    }
    if (reason === 'network' || reason === 'server-error' || reason === 'socket-error') {
        return 'Brak połączenia z serwerem pośredniczącym (0.peerjs.com).';
    }
    return `Nie udało się połączyć z komputerem (${reason}).`;
}

export class RemoteLink {
    private channel: RemoteChannel | null = null;
    /** Bumped on every connect/disconnect, so a late result of an older attempt is ignored. */
    private attempt = 0;

    constructor(private readonly events: LinkEvents) {}

    /** There is no list of PCs to ask for: offer the ones this phone has scanned a QR of. */
    start(): void {
        this.events.status({ kind: 'idle' });
        this.refreshHosts();
    }

    refreshHosts(): void {
        this.events.hosts(prefs.pairedHosts().map(host => ({ hostId: host.hostId, character: host.name })));
    }

    get isOpen(): boolean {
        return this.channel !== null;
    }

    send(message: RemoteMessage): boolean {
        if (!this.channel) return false;
        this.channel.send(JSON.stringify(message));
        return true;
    }

    disconnect(): void {
        this.attempt++;
        const channel = this.channel;
        this.channel = null;
        channel?.close();
        this.events.status({ kind: 'idle' });
    }

    async connect(hostId: string): Promise<void> {
        const pair = prefs.pairCode(hostId);
        if (!pair) return;
        const attempt = ++this.attempt;
        this.channel?.close();
        this.channel = null;
        this.events.status({ kind: 'connecting', hostId });

        let channel: RemoteChannel;
        try {
            channel = await connectToHost(pair);
        } catch (error) {
            if (attempt === this.attempt) this.events.status({ kind: 'lost', hostId, reason: lostReason(error) });
            return;
        }
        if (attempt !== this.attempt) {
            channel.close();
            return;
        }

        this.channel = channel;
        let saidBye = false;
        channel.onMessage(text => {
            const message = parseHostMessage(text);
            if (!message) return;
            if (message.t === 'hello') {
                if (message.state.character) {
                    prefs.setHostName(hostId, message.state.character);
                    this.refreshHosts();
                }
                this.events.hello(message.state, message.backlog);
            } else if (message.t === 'bye') {
                saidBye = true;
            } else if (message.t === 'state') {
                this.events.state(message.state);
            } else {
                this.events.output(message.html);
            }
        });
        channel.onClose(() => {
            if (this.channel !== channel) return;
            this.channel = null;
            this.events.status(saidBye
                ? { kind: 'lost', hostId, reason: 'Komputer rozłączył ten telefon.', byHost: true }
                : { kind: 'lost', hostId, reason: 'Połączenie z komputerem zostało zamknięte.' });
        });
        this.events.status({ kind: 'connected', hostId });
    }
}
