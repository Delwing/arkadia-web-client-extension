import type Client from '@client/Client';
import { createAttackController } from '@client/utils/attackController';

/**
 * One attack controller per client, shared across the Forged UI.
 *
 * `createAttackController` registers bus/storage listeners and emits an initial
 * `attackMode` event, so it must run exactly once per client — not once per
 * component mount. The stock UI gets its instance from `ObjectList`; the forge UI
 * never builds that, so we memoize here and hand the same instance to every
 * consumer (currently the object list).
 */
const cache = new WeakMap<Client, ReturnType<typeof createAttackController>>();

export function getAttackController(client: Client): ReturnType<typeof createAttackController> {
    let controller = cache.get(client);
    if (!controller) {
        controller = createAttackController(client);
        cache.set(client, controller);
    }
    return controller;
}
