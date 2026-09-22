/**
 * Custom commands on the enemy binds (F1-F3 and their block binds).
 *
 * A bind's command is a template the player writes in Ustawienia; the enemy's
 * GMCP object number is filled in wherever the template asks for it, so one
 * command works for whichever enemy the slot is holding:
 *
 *     zabij ob_{obj_id}      ->  zabij ob_12345
 *     wesprzyj ob_$id        ->  wesprzyj ob_12345
 *
 * A template with no placeholder is sent as written - some commands do not
 * need a target.
 */

/** `{obj_id}`, `{objId}`, `{id}`, `$obj_id` and `$id`, in any case. */
const OBJECT_ID_PLACEHOLDER = /\{\s*(?:obj_?id|id)\s*\}|\$obj_?id\b|\$id\b/gi;

/** The command a bind sends for `objectId`, or null when nothing is configured. */
export function enemyBindCommand(template: string | undefined | null, objectId: number): string | null {
    const text = typeof template === 'string' ? template.trim() : '';
    if (!text) return null;
    return text.replace(OBJECT_ID_PLACEHOLDER, String(objectId));
}

/** What to call a custom command in the binds listing: its first word. */
export function enemyBindCommandLabel(template: string | undefined | null, fallback: string): string {
    const text = typeof template === 'string' ? template.trim() : '';
    if (!text) return fallback;
    return text.split(/\s+/)[0];
}
