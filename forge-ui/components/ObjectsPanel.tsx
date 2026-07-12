import { type CSSProperties, type MouseEvent } from 'react';
import { getBehaviorSettings } from '@modules/core/settings';
import { showContextMenu } from '@web/contextMenu';
import { useClient } from '../client/ClientContext';
import { getAttackController } from '../client/attackController';
import { useObjects, type GameObject } from '../hooks/useObjects';
import Panel from './Panel';

type Allegiance = 'you' | 'ally' | 'enemy';

/** Right-click commands, mirroring the stock ObjectList default. */
const DEFAULT_CONTEXT_MENU_COMMANDS = ['ob', 'ocen', 'zapros', 'wskaz'];

function getContextMenuCommands(): string[] {
    const commands = getBehaviorSettings().objectContextMenuCommands;
    if (Array.isArray(commands) && commands.length > 0) {
        return commands.filter((c: unknown): c is string => typeof c === 'string');
    }
    return DEFAULT_CONTEXT_MENU_COMMANDS;
}

/**
 * The click actions the stock UI exposes on each object row, keyed off the same
 * commands: tap the number to attack (`attackById` honours the AW/AWR leader
 * mode), the name to guard (`/za`), the HP bar to break through an enemy
 * (`/prze`) or pull a teammate back (`/w`), and right-click for the configurable
 * command menu (`<command> ob_<num>`). Nothing is wired for yourself.
 */
interface ObjectActions {
    onNumber: (o: GameObject, allegiance: Allegiance) => void;
    onName: (o: GameObject, allegiance: Allegiance) => void;
    onHp: (o: GameObject, allegiance: Allegiance) => void;
    onContextMenu: (e: MouseEvent, o: GameObject, allegiance: Allegiance) => void;
}

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

function ObjectRow({ row, actions }: { row: Row; actions: ObjectActions }) {
    const { o, allegiance, nameClass, attackers, threatened } = row;
    const isPlayer = allegiance === 'you';
    const hasHp = typeof o.hp === 'number';

    let hpStyle: CSSProperties | undefined;
    if (hasHp) {
        const hp = Math.max(0, Math.min(6, o.hp as number)) + 1; // 1..7
        hpStyle = { '--hp': `${Math.round((hp / 7) * 100)}%` } as CSSProperties;
    }

    // Match the stock affordances: the number attacks enemies, the name guards
    // any non-player, the HP bar breaks/pulls-back. Yourself stays inert.
    const keyClickable = allegiance === 'enemy';
    const nameClickable = !isPlayer;
    const hpClickable = hasHp && !isPlayer;

    return (
        <div
            className={'obj' + (threatened ? ' obj--threatened' : '')}
            onContextMenu={(e) => actions.onContextMenu(e, o, allegiance)}
        >
            <div className="obj__main">
                <span
                    className={
                        'obj__key' + (isPlayer ? ' you' : '') + (keyClickable ? ' is-clickable' : '')
                    }
                    title={keyClickable ? 'Zaatakuj' : undefined}
                    onClick={keyClickable ? () => actions.onNumber(o, allegiance) : undefined}
                >
                    <i>{o.shortcut}</i>
                </span>
                <span
                    className={
                        'obj__name' + (nameClass ? ` ${nameClass}` : '') +
                        (nameClickable ? ' is-clickable' : '')
                    }
                    title={nameClickable ? 'Zaslon' : undefined}
                    onClick={nameClickable ? () => actions.onName(o, allegiance) : undefined}
                >
                    {o.desc ?? ''}
                </span>
                {hasHp && (
                    <span
                        className={'obj__hp' + (hpClickable ? ' is-clickable' : '')}
                        style={hpStyle}
                        title={hpClickable ? (allegiance === 'ally' ? 'Wycofaj sie' : 'Przelam') : undefined}
                        onClick={hpClickable ? () => actions.onHp(o, allegiance) : undefined}
                    />
                )}
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

export default function ObjectsPanel({ bare = false }: { bare?: boolean } = {}) {
    const client = useClient();
    const objects = useObjects(client);

    const allegianceOf = (o: GameObject): Allegiance => {
        if (o.shortcut === '@') return 'you';
        if (client.TeamManager?.isInTeam?.(o.desc ?? '')) return 'ally';
        return 'enemy';
    };

    const focusInput = () => {
        (document.getElementById('alt-input') as HTMLTextAreaElement | null)?.focus();
    };

    const actions: ObjectActions = {
        onNumber: (o, allegiance) => {
            if (allegiance === 'enemy') getAttackController(client).attackById(o.num);
            focusInput();
        },
        onName: (o) => {
            client.sendCommand(`/za ${o.shortcut}`);
            focusInput();
        },
        onHp: (o, allegiance) => {
            client.sendCommand(`${allegiance === 'ally' ? '/w' : '/prze'} ${o.shortcut}`);
            focusInput();
        },
        onContextMenu: (e, o, allegiance) => {
            if (allegiance === 'you') return;
            const commands = getContextMenuCommands();
            if (commands.length === 0) return;
            e.preventDefault();
            const items = commands.map((command) => ({
                label: command,
                action: () => client.sendCommand(`${command} ob_${o.num}`),
            }));
            showContextMenu(items, e.clientX, e.clientY);
        },
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

    const body = rows.length === 0
        ? <div className="obj--empty">Pustka.</div>
        : rows.map((row) => <ObjectRow key={row.o.num} row={row} actions={actions} />);

    // Bare mode: render just the body, no forged Panel chrome — used when the
    // shared dock manager owns the panel frame (title/header/bevel) and only
    // needs the "W poblizu" content portaled into its built-in objectList slot.
    if (bare) {
        return <div className="panel__body obj-list-bare" id="alt-objects">{body}</div>;
    }

    return (
        <Panel title="W poblizu" meta={objects.length} metaId="alt-objects-count" bodyId="alt-objects">
            {body}
        </Panel>
    );
}
