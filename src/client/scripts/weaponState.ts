import Client from "../Client";
import weaponOnPatterns from "./weapon_on_patterns.json";
import weaponOffPatterns from "./weapon_off_patterns.json";
import { UNARMED_ATTACK_PATTERNS } from "./noWeaponAlert";
import { registerUpstreamTrigger, type UpstreamTrigger } from "./upstreamTriggers";

export default function initWeaponState(client: Client) {
    const tag = 'weapon-state';
    // undefined until something (draw/sheathe line, disarm, ...) reports the state
    let known: boolean | undefined;
    client.on('weapon_state', (drawn) => {
        known = drawn;
    });

    function setWeaponOn() {
        client.sendEvent('weapon_state', true);
        return undefined;
    }

    function setWeaponOff() {
        client.sendEvent('weapon_state', false);
        return undefined;
    }

    for (const entry of weaponOnPatterns as UpstreamTrigger[]) {
        registerUpstreamTrigger(client.Triggers, entry, setWeaponOn, tag);
    }
    for (const entry of weaponOffPatterns as UpstreamTrigger[]) {
        registerUpstreamTrigger(client.Triggers, entry, setWeaponOff, tag);
    }

    // Handle weapon knocked off events
    client.on('weaponKnockedOff', setWeaponOff);
    client.on('weaponKnockedOffNekroTilea', setWeaponOff);
    // The game's own "you fight without a weapon" line (color_bron.lua)
    client.on('ateamFightingWithNoWeapon', setWeaponOff);

    // While the state is unknown, our first regular hit (any Lua or TS gag
    // classified as moje_ciosy) settles it once: a hit that isn't a fist/kick
    // hit means a weapon is already in hand.
    client.on('combat.gag', ({ type, text }) => {
        if (known !== undefined || type !== 'moje_ciosy') {
            return;
        }
        if (UNARMED_ATTACK_PATTERNS.some(p => p.test(text))) {
            known = false;
            return;
        }
        setWeaponOn();
    });

    // Reset state on disconnect
    client.on('client.disconnect', () => {
        client.sendEvent('weapon_state', false);
        known = undefined;
    });
}
