import { type CSSProperties } from 'react';
import { useClient } from '../client/ClientContext';
import { useObjects, type GameObject } from '../hooks/useObjects';
import Panel from './Panel';

type Allegiance = 'you' | 'ally' | 'enemy';

interface Attacker {
    shortcut: string;
    allegiance: Allegiance;
}

interface Row {
    o: GameObject;
    allegiance: Allegiance;
    nameClass?: string;
    attackers: Attacker[];
    threatened: boolean;
}

function isAttacking(o: GameObject): boolean {
    return o.attack_num !== false && o.attack_num !== undefined;
}

function nameClassFor(o: GameObject, allegiance: Allegiance): string | undefined {
    if (allegiance === 'you') return undefined;
    if (o.avatar_target) return 'target';
    if (allegiance === 'ally') return 'ally';
    if (typeof o.hp === 'number' && isAttacking(o)) return 'enemy';
    if (typeof o.hp !== 'number') return 'item';
    return undefined;
}

function ObjectRow({ row }: { row: Row }) {
    const { o, allegiance, nameClass, attackers, threatened } = row;
    const isPlayer = allegiance === 'you';
    const hasHp = typeof o.hp === 'number';

    let hpStyle: CSSProperties | undefined;
    if (hasHp) {
        const hp = Math.max(0, Math.min(6, o.hp as number)) + 1; // 1..7
        hpStyle = { '--hp': `${Math.round((hp / 7) * 100)}%` } as CSSProperties;
    }

    return (
        <div className={'obj' + (threatened ? ' obj--threatened' : '')}>
            <div className="obj__main">
                <span className={'obj__key' + (isPlayer ? ' you' : '')}>
                    <i>{o.shortcut}</i>
                </span>
                <span className={'obj__name' + (nameClass ? ` ${nameClass}` : '')}>{o.desc ?? ''}</span>
                {hasHp && <span className="obj__hp" style={hpStyle} />}
            </div>
            {attackers.length > 0 && (
                <div className="obj__fray" title="Atakowany przez">
                    <span className="obj__fray-chips">
                        {attackers.map((a, i) => (
                            <span key={i} className={`atk atk--${a.allegiance}`}>{a.shortcut}</span>
                        ))}
                    </span>
                </div>
            )}
        </div>
    );
}

export default function ObjectsPanel() {
    const client = useClient();
    const objects = useObjects(client);

    const allegianceOf = (o: GameObject): Allegiance => {
        if (o.shortcut === '@') return 'you';
        if (client.TeamManager?.isInTeam?.(o.desc ?? '')) return 'ally';
        return 'enemy';
    };

    // Who is attacking whom: only a numeric attack_num links one row to another
    // (it holds the target's num). `true` just means "in combat, target unknown".
    const attackersByNum = new Map<number, GameObject[]>();
    for (const o of objects) {
        if (typeof o.attack_num === 'number') {
            const list = attackersByNum.get(o.attack_num);
            if (list) list.push(o);
            else attackersByNum.set(o.attack_num, [o]);
        }
    }

    const rows: Row[] = objects.map((o) => {
        const allegiance = allegianceOf(o);
        const attackers: Attacker[] = (attackersByNum.get(o.num) ?? []).map((a) => ({
            shortcut: a.shortcut,
            allegiance: allegianceOf(a),
        }));
        const threatened =
            (allegiance === 'you' || allegiance === 'ally') &&
            attackers.some((a) => a.allegiance === 'enemy');
        return { o, allegiance, nameClass: nameClassFor(o, allegiance), attackers, threatened };
    });

    return (
        <Panel title="W poblizu" meta={objects.length} metaId="alt-objects-count" bodyId="alt-objects">
            {rows.length === 0
                ? <div className="obj--empty">Pustka.</div>
                : rows.map((row) => <ObjectRow key={row.o.num} row={row} />)}
        </Panel>
    );
}
