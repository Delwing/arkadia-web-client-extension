import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type FormEvent, type MouseEvent, type TouchEvent, type WheelEvent } from "react";
import { emptyRemoteState, type RemoteState } from "@modules/remoteControl/protocol.ts";
import { RemoteLink, type HostEntry, type LinkStatus } from "./connection";
import { prefs, type Panel } from "./prefs";
import { keepAwake } from "./keepAwake";
import { VitalsBar } from "./VitalsBar";
import { DirectionPad } from "./DirectionPad";
import { splitExits } from "./exits";
import { QuickCommands } from "./QuickCommands";
import { MapPanel } from "./MapPanel";
import { ObjectsPanel } from "./ObjectsPanel";

/** Output nodes kept on the phone; older ones are dropped from the top. */
const MAX_NODES = 4000;
/** Lines the split view's bottom pane keeps: more than it can show at once. */
const TAIL_LINES = 80;
/** Reconnects tried on their own before waiting for a tap. */
const AUTO_RETRIES = 3;
const FONT_MIN = 10;
const FONT_MAX = 22;

function hostLabel(host: HostEntry): string {
    return host.character ?? `Komputer ${host.hostId.slice(0, 6)}`;
}

export function RemoteApp() {
    const [status, setStatus] = useState<LinkStatus>({ kind: 'starting' });
    const [hosts, setHosts] = useState<HostEntry[]>([]);
    const [game, setGame] = useState<RemoteState>(emptyRemoteState);
    const [panel, setPanelState] = useState<Panel>(prefs.panel);
    const [quick, setQuickState] = useState<string[]>(prefs.quick);
    const [history, setHistory] = useState<string[]>(prefs.history);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [draft, setDraft] = useState('');
    const [fontSize, setFontSizeState] = useState(prefs.fontSize);
    const [mapOpen, setMapOpen] = useState(prefs.mapOpen);
    // Once opened, the map stays mounted and is only hidden, so reopening is instant.
    const [mapUsed, setMapUsed] = useState(prefs.mapOpen);
    const [atBottom, setAtBottom] = useState(true);

    const outputRef = useRef<HTMLDivElement>(null);
    /** The split view's bottom pane: the newest lines, live, while the output is scrolled up. */
    const tailRef = useRef<HTMLDivElement>(null);
    const tailPaneRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const followRef = useRef(true);
    const retriesRef = useRef(0);
    const statusRef = useRef(status);
    statusRef.current = status;
    const hostsRef = useRef(hosts);
    hostsRef.current = hosts;

    const scrollToBottom = useCallback(() => {
        const el = outputRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        followRef.current = true;
        setAtBottom(true);
    }, []);

    const append = useCallback((html: string) => {
        const el = outputRef.current;
        if (!el) return;
        // One line per message, as the PC output shows them; an empty one keeps its height.
        const line = document.createElement('div');
        line.className = 'rc-line';
        if (html === '') line.innerHTML = '&nbsp;';
        else line.innerHTML = html;
        el.append(line);
        while (el.childNodes.length > MAX_NODES) el.firstChild?.remove();
        if (followRef.current) el.scrollTop = el.scrollHeight;

        const tail = tailRef.current;
        if (tail) {
            tail.append(line.cloneNode(true));
            while (tail.childNodes.length > TAIL_LINES) tail.firstChild?.remove();
            tail.scrollTop = tail.scrollHeight;
        }
    }, []);

    const link = useMemo(() => new RemoteLink({
        hosts: setHosts,
        status: setStatus,
        hello: (state, backlog) => {
            setGame(state);
            outputRef.current?.replaceChildren();
            tailRef.current?.replaceChildren();
            backlog.forEach(append);
            scrollToBottom();
        },
        state: patch => setGame(previous => ({ ...previous, ...patch })),
        output: append,
    }), [append, scrollToBottom]);

    const connect = useCallback((hostId: string) => {
        if (!prefs.pairCode(hostId)) return;
        prefs.setLastHost(hostId);
        void link.connect(hostId);
    }, [link]);

    useEffect(() => {
        link.start();
        return () => link.disconnect();
    }, [link]);

    // Back on the PC you used last, without a tap: on load, and after a drop.
    useEffect(() => {
        const last = prefs.lastHost();
        if (!last || !prefs.pairCode(last) || !hosts.some(host => host.hostId === last)) return;
        if (status.kind === 'idle' && retriesRef.current === 0) {
            retriesRef.current = 1;
            connect(last);
        } else if (status.kind === 'lost' && retriesRef.current < AUTO_RETRIES) {
            retriesRef.current += 1;
            const timer = setTimeout(() => connect(last), 1500);
            return () => clearTimeout(timer);
        }
    }, [status, hosts, connect]);

    useEffect(() => {
        if (status.kind === 'connected') retriesRef.current = 0;
    }, [status]);

    // A phone that slept may hold a dead connection; coming back is the cue to retry.
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            const current = statusRef.current;
            if (current.kind === 'lost' && hostsRef.current.some(host => host.hostId === current.hostId)) {
                retriesRef.current = 0;
                connect(current.hostId);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [connect]);

    // Screen on while a PC is being driven, reconnects included.
    const driving = status.kind === 'connected' || status.kind === 'connecting' || status.kind === 'lost';
    useEffect(() => {
        if (!driving) return;
        return keepAwake();
    }, [driving]);

    useLayoutEffect(() => {
        if (followRef.current && outputRef.current) outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }, [fontSize, panel]);

    // A pane that was hidden kept its old scroll; open it on the newest line.
    useLayoutEffect(() => {
        const tail = tailRef.current;
        if (!atBottom && tail) tail.scrollTop = tail.scrollHeight;
    }, [atBottom, fontSize]);

    const send = useCallback((command: string) => {
        if (!link.send({ t: 'cmd', text: command })) return;
        if (command.trim()) setHistory(prefs.pushHistory(command));
        scrollToBottom();
    }, [link, scrollToBottom]);

    const onSubmit = (event: FormEvent) => {
        event.preventDefault();
        send(draft);
        setDraft('');
        setHistoryOpen(false);
    };

    /**
     * Split view as the PC does it: the pane opens on the first move up, before
     * the output has scrolled, and covers the newest lines with the same lines -
     * so nothing on screen jumps. Back at the very bottom it closes.
     */
    const touchYRef = useRef<number | null>(null);
    const openSplit = () => {
        const el = outputRef.current;
        if (!followRef.current || !el || el.scrollHeight <= el.clientHeight) return;
        followRef.current = false;
        setAtBottom(false);
    };
    const onScroll = () => {
        const el = outputRef.current;
        if (!el) return;
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
        // Mid-drag the pane has just opened over a view still at the bottom: lifting the finger decides.
        if (bottom && touchYRef.current !== null) return;
        followRef.current = bottom;
        if (bottom !== atBottom) setAtBottom(bottom);
    };
    const onTouchStart = (event: TouchEvent) => {
        touchYRef.current = event.touches[0]?.clientY ?? null;
    };
    const onTouchMove = (event: TouchEvent) => {
        const start = touchYRef.current;
        const y = event.touches[0]?.clientY;
        // A finger moving down scrolls the text up.
        if (start !== null && y !== undefined && y - start > 2) openSplit();
    };
    const onTouchEnd = () => {
        touchYRef.current = null;
        onScroll();
    };
    /** A tap (not a drag) where the live pane lies goes back to the bottom. */
    const onOutputClick = (event: MouseEvent) => {
        const pane = tailPaneRef.current;
        if (atBottom || !pane) return;
        if (event.clientY >= pane.getBoundingClientRect().top) scrollToBottom();
    };
    const onWheel = (event: WheelEvent) => {
        if (event.deltaY < 0) openSplit();
    };

    const setPanel = (next: Panel) => {
        const value = next === panel ? 'none' : next;
        setPanelState(value);
        prefs.setPanel(value);
    };
    const setQuick = (commands: string[]) => {
        setQuickState(commands);
        prefs.setQuick(commands);
    };
    const toggleMap = () => {
        setMapOpen(!mapOpen);
        setMapUsed(true);
        prefs.setMapOpen(!mapOpen);
    };
    const changeFont = (delta: number) => {
        const size = Math.min(FONT_MAX, Math.max(FONT_MIN, fontSize + delta));
        setFontSizeState(size);
        prefs.setFontSize(size);
    };

    const connected = status.kind === 'connected';
    const { directions, named } = splitExits(game.room?.exits ?? []);
    const recent = history.slice(-15).reverse();
    // Map data often names a room by a bare number; that says nothing on screen.
    const roomName = game.room?.name && /[a-z]/i.test(game.room.name) ? game.room.name : null;

    return (
        <div className="rc-app">
            <header className="rc-header">
                <span className={`rc-dot rc-dot-${status.kind}`}/>
                <span className="rc-title">
                    {connected ? (game.character ?? 'Połączono') : statusText(status)}
                </span>
                {connected && (
                    <button type="button" className={mapOpen ? 'rc-icon on' : 'rc-icon'} onClick={toggleMap}>Mapa</button>
                )}
                <button type="button" className="rc-icon" onClick={() => changeFont(-1)}>A−</button>
                <button type="button" className="rc-icon" onClick={() => changeFont(1)}>A+</button>
                {connected && <button type="button" className="rc-icon" onClick={() => link.disconnect()}>Rozłącz</button>}
            </header>

            {connected && <VitalsBar vitals={game.vitals} combat={game.combat}/>}
            {connected && (roomName || named.length > 0) && (
                <div className="rc-room">
                    {roomName && <span className="rc-room-name">{roomName}</span>}
                    {named.map(exit => (
                        <button key={exit} type="button" className="rc-chip-btn rc-exit" onClick={() => send(exit)}>{exit}</button>
                    ))}
                </div>
            )}

            {!connected && (
                <div className="rc-hosts">
                    {status.kind === 'unavailable' && <p>{status.reason}</p>}
                    {status.kind === 'lost' && <p>{status.reason}</p>}
                    {(status.kind === 'idle' || status.kind === 'lost') && hosts.length === 0 && (
                        <p>Brak komputera do sterowania. Wpisz /pilot w kliencie na komputerze i włącz sterowanie.</p>
                    )}
                    {(status.kind === 'idle' || status.kind === 'lost') && hosts.length > 0 && !hosts.some(host => prefs.pairCode(host.hostId)) && (
                        <p>Zeskanuj telefonem kod QR z okna /pilot na komputerze.</p>
                    )}
                    {(status.kind === 'idle' || status.kind === 'lost') && hosts.filter(host => prefs.pairCode(host.hostId)).map(host => (
                        <button key={host.hostId} type="button" className="rc-host" onClick={() => {
                            retriesRef.current = 0;
                            connect(host.hostId);
                        }}>
                            {status.kind === 'lost' && status.hostId === host.hostId ? 'Połącz ponownie: ' : 'Steruj: '}
                            {hostLabel(host)}
                        </button>
                    ))}
                </div>
            )}

            <div className="rc-output-wrap" hidden={!connected && status.kind !== 'lost'}>
                <div
                    ref={outputRef}
                    className="rc-output"
                    style={{ fontSize }}
                    onScroll={onScroll}
                    onTouchStart={onTouchStart}
                    onTouchMove={onTouchMove}
                    onTouchEnd={onTouchEnd}
                    onTouchCancel={onTouchEnd}
                    onWheel={onWheel}
                    onClick={onOutputClick}
                />
                {/* Split view: scrolled up, the newest lines stay live below; a tap goes back down. */}
                {/* Touches pass through to the history underneath; a tap on it is handled by onOutputClick. */}
                <div ref={tailPaneRef} className="rc-tail" hidden={atBottom}>
                    <div ref={tailRef} className="rc-tail-lines" style={{ fontSize }}/>
                </div>
                {!atBottom && (
                    <button type="button" className="rc-jump" onClick={scrollToBottom}>↓ Na dół</button>
                )}
                {/* Over the output, see-through, so the text keeps its full height. */}
                {connected && mapUsed && <MapPanel roomId={game.room?.id ?? null} visible={mapOpen}/>}
                {connected && <DirectionPad exits={directions} center="zerknij" onSend={send}/>}
            </div>

            {connected && (
                <footer className="rc-controls">
                    {panel === 'objects' && <ObjectsPanel objects={game.objects} attackCommand={game.attackCommand} onSend={send}/>}
                    {panel === 'quick' && <QuickCommands commands={quick} draft={draft} onSend={send} onChange={setQuick}/>}
                    {historyOpen && recent.length > 0 && (
                        <div className="rc-history">
                            {recent.map(command => (
                                <button key={command} type="button" className="rc-history-item" onClick={() => {
                                    setDraft(command);
                                    setHistoryOpen(false);
                                    inputRef.current?.focus();
                                }}>{command}</button>
                            ))}
                        </div>
                    )}
                    <div className="rc-tabs">
                        <button type="button" className={panel === 'objects' ? 'rc-tab on' : 'rc-tab'} onClick={() => setPanel('objects')}>
                            Obiekty{game.objects.length > 0 ? ` (${game.objects.length})` : ''}
                        </button>
                        <button type="button" className={panel === 'quick' ? 'rc-tab on' : 'rc-tab'} onClick={() => setPanel('quick')}>Szybkie</button>
                        <button type="button" className={historyOpen ? 'rc-tab on' : 'rc-tab'} onClick={() => setHistoryOpen(!historyOpen)}>Historia</button>
                    </div>
                    <form className="rc-form" onSubmit={onSubmit} autoComplete="off">
                        <input
                            ref={inputRef}
                            className="rc-input"
                            value={draft}
                            onChange={event => setDraft(event.target.value)}
                            autoCapitalize="off"
                            autoCorrect="off"
                            spellCheck={false}
                            enterKeyHint="send"
                            placeholder="Komenda…"
                        />
                        <button type="submit" className="rc-send">Wyślij</button>
                    </form>
                </footer>
            )}
        </div>
    );
}

function statusText(status: LinkStatus): string {
    switch (status.kind) {
        case 'starting': return 'Uruchamianie…';
        case 'unavailable': return 'Pilot niedostępny';
        case 'idle': return 'Wybierz komputer';
        case 'connecting': return 'Łączenie z komputerem…';
        case 'connected': return 'Połączono';
        case 'lost': return 'Rozłączono';
    }
}
