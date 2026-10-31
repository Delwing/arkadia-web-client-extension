-- Triggers in the `skrypty/events` group of Arkadia.xml only turn game lines
-- into events, and everything that reacts to those lines subscribes to the
-- event instead of being called from the trigger.
--
-- The web client (Delwing/arkadia-web-client-extension) extracts this group
-- together with this file and runs both as they are, so it never has to copy
-- the patterns by hand. Keep the functions here self-contained: raiseEvent and
-- basic line formatting (selectCurrentLine, selectString, fg, replace,
-- resetFormat) only, and raise the event before anything that could return
-- early. Logic that needs other modules belongs in an event handler.
--
-- Events raised here are described in events.md.

function trigger_func_skrypty_events_atakuje_cie()
    raiseEvent("attacked", matches[2], false)
end

function trigger_func_skrypty_events_player_atakuje_cie()
    raiseEvent("attacked", matches[2], true)

    selectCurrentLine()
    fg("red")
    if matches[3] and selectString(matches[3], 1) > -1 then
        replace(matches[3]:upper())
    end
    resetFormat()
end
