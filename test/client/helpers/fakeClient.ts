import eventBus from '@modules/core/eventBus';
import { createRootScope } from '@client/ScriptScope';

/**
 * The bits of `Client` that a script reaches for regardless of what it does:
 * the event bus, and the scope it registers timers and DOM listeners through.
 *
 * Stubs in tests only need to add what the script under test actually uses;
 * extend this so they don't each have to re-stub the ambient surface. The scope
 * here is a real one, so a script's timers behave exactly as they do in the app —
 * it simply never gets disposed.
 */
export class FakeClientBase {
    scope = createRootScope('test');

    on(event: any, listener: any, options?: any) {
        return eventBus.on(event, listener, options);
    }

    off(event: any, listener: any) {
        eventBus.off(event, listener);
    }

    emit(event: any, ...args: any[]) {
        (eventBus.emit as (...a: any[]) => number)(event, ...args);
    }
}
