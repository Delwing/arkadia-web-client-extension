import {getBehaviorSettings} from "@modules/core/settings";
import {prefilterMisses, prefilterVerifyStats} from "@client/triggerPrefilter.ts";

const SUMMARY_INTERVAL_MS = 30_000;

/**
 * Debug hooks for the trigger prefilter's verify mode (Ustawienia > Inne > Filtr
 * wyzwalaczy > Weryfikacja). Each miss is already a console error; this keeps them in
 * `window.triggerPrefilterMisses` for copying out, and while verify is on logs how many
 * matches have been checked, so a quiet console reads as "verified" rather than "idle".
 */
export function installTriggerPrefilterDebug(): void {
    (window as any).triggerPrefilterMisses = prefilterMisses;

    let lastChecked = prefilterVerifyStats.checked;
    setInterval(() => {
        if (getBehaviorSettings().triggerPrefilter !== "verify") return;
        if (prefilterVerifyStats.checked === lastChecked) return;
        lastChecked = prefilterVerifyStats.checked;
        console.info(
            `[triggers] prefilter verify: ${prefilterVerifyStats.checked} matches checked, ` +
            `${prefilterVerifyStats.misses} misses`,
        );
    }, SUMMARY_INTERVAL_MS);
}
