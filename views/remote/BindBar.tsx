/**
 * The PC's binds, one tap each: the functional bind (what `]` would do now)
 * first and loudest, then the room's binds / multibinds as the PC footer
 * lists them. Key hints are left out - the phone has no keys to press.
 * Hidden while nothing is bound.
 */

import type { RemoteBind } from "@modules/remoteControl/protocol.ts";

export function BindBar({ functional, binds, onFunctional, onBind }: {
    functional: string | null;
    binds: RemoteBind[];
    onFunctional: (action: string) => void;
    onBind: (bind: RemoteBind) => void;
}) {
    if (!functional && binds.length === 0) return null;
    return (
        <div className="rc-binds">
            {functional && (
                <button type="button" className="rc-bind rc-bind-functional" onClick={() => onFunctional(functional)}>
                    <span className="rc-bind-mark">▶</span>{functional}
                </button>
            )}
            {binds.map(bind => (
                <button
                    key={bind.index}
                    type="button"
                    className={bind.kind ? `rc-bind rc-bind-${bind.kind}` : 'rc-bind'}
                    title={bind.action}
                    onClick={() => onBind(bind)}
                >
                    {bind.name ?? bind.action}
                </button>
            ))}
        </div>
    );
}
