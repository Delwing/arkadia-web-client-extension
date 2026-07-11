import { type CSSProperties } from 'react';
import { useClient } from '../client/ClientContext';
import { useObjects, type GameObject } from '../hooks/useObjects';

function categoryClass(o: GameObject, isTeam: boolean): string | undefined {
    const isAttacking = o.attack_num !== false && o.attack_num !== undefined;
    const hasHp = typeof o.hp === 'number';
    if (o.avatar_target) return 'target';
    if (isTeam) return 'ally';
    if (hasHp && isAttacking) return 'enemy';
    if (!hasHp) return 'item';
    return undefined;
}

function ObjectRow({ o, isTeam }: { o: GameObject; isTeam: boolean }) {
    const isPlayer = o.shortcut === '@';
    const hasHp = typeof o.hp === 'number';
    const nameClass = isPlayer ? undefined : categoryClass(o, isTeam);

    let hpStyle: CSSProperties | undefined;
    if (hasHp) {
        const hp = Math.max(0, Math.min(6, o.hp as number)) + 1; // 1..7
        hpStyle = { '--hp': `${Math.round((hp / 7) * 100)}%` } as CSSProperties;
    }

    return (
        <div className="obj">
            <span className={'obj__key' + (isPlayer ? ' you' : '')}>
                <i>{o.shortcut}</i>
            </span>
            <span className={'obj__name' + (nameClass ? ` ${nameClass}` : '')}>{o.desc ?? ''}</span>
            {hasHp && <span className="obj__hp" style={hpStyle} />}
        </div>
    );
}

export default function ObjectsPanel() {
    const client = useClient();
    const objects = useObjects(client);

    return (
        <div className="forged panel">
            <div className="panel__head">
                <span className="orn" />
                <span className="panel__title">W poblizu</span>
                <span className="panel__meta" id="alt-objects-count">{objects.length}</span>
            </div>
            <div className="panel__body" id="alt-objects">
                {objects.length === 0
                    ? <div className="obj--empty">Pustka.</div>
                    : objects.map((o) => (
                        <ObjectRow
                            key={o.num}
                            o={o}
                            isTeam={o.shortcut !== '@' && !!client.TeamManager?.isInTeam?.(o.desc ?? '')}
                        />
                    ))}
            </div>
        </div>
    );
}
