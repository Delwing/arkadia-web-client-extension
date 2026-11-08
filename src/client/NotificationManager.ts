import { getHostPort } from './ports';

/**
 * Local, on-this-machine notifications.
 *
 * Deliberately does NOT forward anything to paired devices. Push is opt-in per
 * alert: the player binds a `push` macro to the trigger or event they actually
 * care about (see SUPPORTED_EVENTS in scripts/userTriggers.ts). Fanning every
 * internal `notify()` out to a phone meant chatty, low-stakes messages — a full
 * hp timer, a walk step — buzzing a pocket, which is not what anyone paired a
 * device for.
 */
export default class NotificationManager {
    enableNotifications() {
        getHostPort().enableNotifications();
    }

    notify(message: string) {
        getHostPort().notify(message);
    }
}
