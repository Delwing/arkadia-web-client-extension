import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import eventBus from '@modules/core/eventBus';
import type { TransportDebugState } from '@client/types/transport';

const KIND_COLOR: Record<string, string> = {
    idle: '#888',
    pending: '#f0a500',
    at_stop: '#4caf50',
    traveling: '#2196f3',
    exiting: '#ff5722',
};

export default function TransportDebugPopup() {
    const [visible, setVisible] = useState(false);
    const [state, setState] = useState<TransportDebugState | null>(null);
    const [log, setLog] = useState<Array<{ time: string; kind: string }>>([]);

    useEffect(() => {
        const unsubDebug = eventBus.on('transportDebug', (payload) => {
            setState(payload);
            if (payload) {
                const time = new Date().toLocaleTimeString('pl', { hour12: false });
                setLog(prev => [...prev.slice(-19), { time, kind: payload.kind }]);
            }
        });
        const unsubToggle = eventBus.on('transportDebug.toggle', () => setVisible(v => !v));
        return () => { unsubDebug(); unsubToggle(); };
    }, []);

    if (!visible) return null;

    const kindColor = KIND_COLOR[state?.kind ?? ''] ?? '#ccc';

    const content = (
        <div style={{
            position: 'fixed', top: 8, right: 8, zIndex: 9999,
            background: '#1a1a1a', border: '1px solid #444', borderRadius: 6,
            padding: '8px 12px', fontFamily: 'monospace', fontSize: 11, color: '#ddd',
            minWidth: 260, maxWidth: 360, opacity: 0.92,
            pointerEvents: 'none',
        }}>
            <div style={{ marginBottom: 4, borderBottom: '1px solid #333', paddingBottom: 4 }}>
                <span style={{ color: kindColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {state?.kind ?? 'no data'}
                </span>
                {state?.def && <span style={{ color: '#aaa', marginLeft: 8 }}>{state.def}</span>}
            </div>

            {state?.locationId !== null && state?.locationId !== undefined && (
                <Row label="loc" value={String(state.locationId)} />
            )}
            {state?.pendingDefs && <Row label="pending" value={state.pendingDefs} />}
            {state?.next && <Row label="next" value={state.next} />}
            {state?.leg && <Row label="leg" value={state.leg} color="#2196f3" />}

            {log.length > 0 && (
                <div style={{ marginTop: 6, borderTop: '1px solid #333', paddingTop: 4, opacity: 0.6 }}>
                    {log.slice(-5).map((e, i) => (
                        <div key={i} style={{ color: KIND_COLOR[e.kind] ?? '#ccc' }}>
                            {e.time} {e.kind}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return createPortal(content, document.body);
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div style={{ display: 'flex', gap: 6, marginTop: 2, lineHeight: 1.4 }}>
            <span style={{ color: '#666', minWidth: 52 }}>{label}</span>
            <span style={{ color: color ?? '#e0e0e0', wordBreak: 'break-all' }}>{value}</span>
        </div>
    );
}
