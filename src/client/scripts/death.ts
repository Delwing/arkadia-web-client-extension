import Client from "../Client";

/**
 * The player's own death.
 *
 * The game announces it with one line and nothing else - `Umierasz.`, on its
 * own - so there is no state to keep here and nothing to decide. The script
 * raises `playerDeath` and hands the line on untouched, leaving what to do
 * about it (clearing combat state, counting, sounds, a plugin) to whoever
 * listens.
 *
 * The pattern is anchored on purpose: `Umierasz z glodu.` and the like are
 * warnings, not the death itself.
 */
export default function initDeath(client: Client) {
    client.Triggers.registerTrigger(/^Umierasz\.$/, (line) => {
        client.sendEvent('playerDeath');
        return line;
    }, "player-death");
}
