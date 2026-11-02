/**
 * Who is in the room, with the two commands that matter in a fight: attack
 * and cover.
 */

import type { RemoteObject } from "@modules/remoteControl/protocol.ts";
import { attackCommandFor, coverCommandFor } from "./objectCommands";

/** Object hp runs 0-6 like the player's; shown as 1-7. */
const HP_MAX = 6;

function hpLevel(hp: number): 'ok' | 'warn' | 'bad' {
    const shown = hp + 1;
    return shown <= 3 ? 'bad' : shown <= 5 ? 'warn' : 'ok';
}

export function ObjectsPanel({ objects, attackCommand, onSend }: {
    objects: RemoteObject[];
    attackCommand: string;
    onSend: (command: string) => void;
}) {
    if (objects.length === 0) return <div className="rc-objects rc-objects-empty">Nikogo tu nie ma.</div>;

    return (
        <div className="rc-objects">
            {objects.map(object => {
                const classes = ['rc-obj'];
                if (object.team) classes.push('team');
                if (object.mine) classes.push('mine');
                return (
                    <div key={object.num} className={classes.join(' ')}>
                        <span className="rc-obj-short">{object.shortcut ?? ''}</span>
                        <span className="rc-obj-main">
                            <span className="rc-obj-name">
                                {object.attackTarget && <span className="rc-obj-mark attack">»</span>}
                                {object.defenseTarget && <span className="rc-obj-mark defense">»</span>}
                                {object.desc}
                                {object.fighting && <span className="rc-obj-fight"> ⚔</span>}
                            </span>
                            {object.hp !== null && (
                                <span className={`rc-obj-hp rc-${hpLevel(object.hp)}`}>
                                    {Array.from({ length: HP_MAX + 1 }, (_, i) => (
                                        <span key={i} className={i <= object.hp! ? 'on' : ''}/>
                                    ))}
                                </span>
                            )}
                        </span>
                        {!object.team && (
                            <button type="button" className="rc-obj-btn attack" onClick={() => onSend(attackCommandFor(object, attackCommand))}>
                                Zabij
                            </button>
                        )}
                        <button type="button" className="rc-obj-btn" onClick={() => onSend(coverCommandFor(object))}>
                            Zasłoń
                        </button>
                    </div>
                );
            })}
        </div>
    );
}
