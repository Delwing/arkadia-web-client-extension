import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import eventBus from '@modules/core/eventBus';
import type { TransportDebugState } from '@client/types/transport';

/** Tracker states are categorical, not ranked — the colours live in
 *  TransportDebugPopup.css as `--kind` modifiers on `--ark-data-*`. */
function kindClass(kind: string | undefined): string {
    return kind ? `transport-debug__kind transport-debug__kind--${kind}` : 'transport-debug__kind';
}

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

    const content = (
        /* `data-popup-overlay` is what carries the design-system tokens into
           forge-ui: this overlay portals to <body>, outside the panel that
           popup-host-tokens.css scopes to. See the stylesheet header. */
        <div className="transport-debug" data-popup-overlay>
            <div className="transport-debug__head">
                <span className={`${kindClass(state?.kind)} transport-debug__kind--head`}>
                    {state?.kind ?? 'no data'}
                </span>
                {state?.def && <span className="transport-debug__def">{state.def}</span>}
            </div>

            {state?.locationId !== null && state?.locationId !== undefined && (
                <Row label="loc" value={String(state.locationId)} />
            )}
            {state?.pendingDefs && <Row label="pending" value={state.pendingDefs} />}
            {state?.next && <Row label="next" value={state.next} />}
            {state?.leg && <Row label="leg" value={state.leg} valueClass="transport-debug__row-value--leg" />}

            {log.length > 0 && (
                <div className="transport-debug__log">
                    {log.slice(-5).map((e, i) => (
                        <div key={i} className={kindClass(e.kind)}>
                            {e.time} {e.kind}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );

    return createPortal(content, document.body);
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
    return (
        <div className="transport-debug__row">
            <span className="transport-debug__row-label">{label}</span>
            <span className={valueClass ? `transport-debug__row-value ${valueClass}` : 'transport-debug__row-value'}>
                {value}
            </span>
        </div>
    );
}
