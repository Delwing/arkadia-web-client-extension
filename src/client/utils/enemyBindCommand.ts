/**
 * Custom commands on the enemy binds (F1-F3 and their block binds).
 *
 * A bind's command is a template the player writes in Ustawienia; the enemy in
 * the slot is filled in wherever the template asks for it, so one command works
 * for whichever enemy the slot is holding:
 *
 *     wesprzyj {wrog}                ->  wesprzyj ob_12345
 *     dobadz broni; {atak}           ->  dobadz broni, then the client's usual attack
 *     {atak}; {blok}                 ->  the usual attack, then zablokuj ob_12345
 *
 * Steps are separated with `;`. `{atak}` and `{blok}` stand for the built-in
 * behaviour of the attack and block binds and have to be a step of their own.
 * A template with no placeholder is sent as written - some commands do not
 * need a target.
 */

export type EnemyBindStep =
    | { kind: 'send'; command: string }
    | { kind: 'attack' }
    | { kind: 'block' };

/** `{wrog}` - the enemy as the game addresses it, `ob_12345`. */
const ENEMY_PLACEHOLDER = /\{\s*wrog\s*\}/gi;
/** The bare object number: `{obj_id}`, `{id}`, `$id`; kept for commands written before `{wrog}`. */
const OBJECT_ID_PLACEHOLDER = /\{\s*(?:obj_?id|id)\s*\}|\$obj_?id\b|\$id\b/gi;
const ATTACK_STEP = /^\{\s*atak\s*\}$/i;
const BLOCK_STEP = /^\{\s*blok\s*\}$/i;

/** The steps a bind runs for `objectId`, or null when nothing is configured. */
export function enemyBindSteps(template: string | undefined | null, objectId: number): EnemyBindStep[] | null {
    const text = typeof template === 'string' ? template.trim() : '';
    if (!text) return null;
    const steps: EnemyBindStep[] = [];
    for (const raw of text.split(';')) {
        const part = raw.trim();
        if (!part) continue;
        if (ATTACK_STEP.test(part)) {
            steps.push({ kind: 'attack' });
        } else if (BLOCK_STEP.test(part)) {
            steps.push({ kind: 'block' });
        } else {
            const command = part
                .replace(ENEMY_PLACEHOLDER, `ob_${objectId}`)
                .replace(OBJECT_ID_PLACEHOLDER, String(objectId));
            steps.push({ kind: 'send', command });
        }
    }
    return steps.length ? steps : null;
}

/** What to call a custom command in the binds listing: its first word. */
export function enemyBindCommandLabel(template: string | undefined | null, fallback: string): string {
    const text = typeof template === 'string' ? template.trim() : '';
    if (!text) return fallback;
    const first = text.split(';')[0].trim();
    if (ATTACK_STEP.test(first)) return 'atak';
    if (BLOCK_STEP.test(first)) return 'zablokuj';
    return first.split(/\s+/)[0] || fallback;
}
