import Client from "../Client";
import {colorTokenInLine, createColorFormat} from "@modules/core/Colors";
import {printArrow} from "./printArrow";
import {FormatStateSnapshot} from "@client/ansi/FormatState";

const SURE_WITH_TRACE_COLOR = createColorFormat('#00ff00'); // green
const UNSURE_COLOR = createColorFormat('#ffff00'); // yellow
const SURE_COLOR = createColorFormat('#4169e1'); // royal blue
const NOT_FOUND_COLOR = createColorFormat('#ff0000'); // red

// Helper to prepend colored text to a DOM container
function prependToContainer(container: HTMLElement, text: string, color: FormatStateSnapshot): void {
    const span = document.createElement('span');
    span.textContent = text;
    if (color.foreground) {
        if (color.foreground.space === 'hex') {
            span.style.color = color.foreground.color;
        } else if (color.foreground.space === 'rgb') {
            span.style.color = `rgb(${color.foreground.r}, ${color.foreground.g}, ${color.foreground.b})`;
        }
    }
    container.insertBefore(span, container.firstChild);
}

export default function initTracking(client: Client) {
    const tag = 'tracking';

    // Track active kneeling names with 10s timeout
    const kneelingNames = new Map<string, ReturnType<typeof setTimeout>>();

    // Store reference to the DOM container for the "wstaje" line
    let pendingWstajeContainer: HTMLElement | null = null;
    let trackingFound = false;
    let inTrackingContext = false; // True when we're checking for tracking result after wstaje

    // Someone kneels to examine tracks
    client.Triggers.registerTrigger(
        /^(\w+(?:| \w+ \w+)) kleka, by obejrzec dokladnie grunt\.$/,
        (line, matches) => {
            const name = matches[1];

            // Clear existing timeout if any
            const existing = kneelingNames.get(name);
            if (existing) {
                clearTimeout(existing);
            }

            // Add new tracker with 10s timeout
            const timeout = setTimeout(() => {
                kneelingNames.delete(name);
            }, 10000);

            kneelingNames.set(name, timeout);

            return line;
        },
        tag
    );

    // Someone stands up - use multiline trigger to check for tracking result in next line
    let isWstajeLine = false; // Flag to skip the wstaje line in child trigger
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;

    const wstajeTrigger = client.Triggers.registerTrigger(
        /^(\w+(?:| \w+ \w+)) wstaje\.$/,
        (line, matches) => {
            const name = matches[1];
            const timeout = kneelingNames.get(name);

            if (timeout) {
                clearTimeout(timeout);
                kneelingNames.delete(name);
                // Reset state for new tracking attempt
                pendingWstajeContainer = null;
                trackingFound = false;
                isWstajeLine = true; // Mark that we're on the wstaje line
                inTrackingContext = true; // We're now checking for tracking result

                // Clear any existing fallback timeout
                if (fallbackTimeout) {
                    clearTimeout(fallbackTimeout);
                }

                // Register callback to capture DOM container when line is rendered
                line.onRender((container) => {
                    pendingWstajeContainer = container;

                    // Set fallback timeout - if no tracking result line arrives within 100ms, add prefix
                    fallbackTimeout = setTimeout(() => {
                        if (inTrackingContext && !trackingFound && pendingWstajeContainer) {
                            prependToContainer(pendingWstajeContainer, '[Brak sladow] ', NOT_FOUND_COLOR);
                            pendingWstajeContainer = null;
                            inTrackingContext = false;
                        }
                        fallbackTimeout = null;
                    }, 100);
                });
            }

            return line;
        },
        tag,
        { stayOpenLines: 1 }
    );

    const trackingResultPattern = /^Jest(?:es w stanie wyroznic kilka sladow na ziemi| ona? .*)\. Najswiezsze(?<race> zostaly pozostawione.*)? prowadza(?<unsure> prawdopodobnie)?(?: na)? (?<direction>.*)\.$/;

    // Child trigger to detect tracking result after wstaje
    // This fires on the line AFTER wstaje (due to stayOpenLines: 1)
    // It does NOT print arrows - the standalone trigger handles that
    wstajeTrigger.registerChild(
        /.*/,
        (line) => {
            // Skip the wstaje line itself (child also fires on parent match)
            if (isWstajeLine) {
                isWstajeLine = false;
                return line;
            }

            // Only process if we're in a tracking context (after kleka + wstaje)
            if (!inTrackingContext) {
                return line;
            }

            const matches = line.text.match(trackingResultPattern);

            if (matches) {
                // Tracking result found - mark as found so we don't add prefix
                trackingFound = true;
                inTrackingContext = false; // Done with this tracking context
                pendingWstajeContainer = null;

                // Clear the fallback timeout since we got a result
                if (fallbackTimeout) {
                    clearTimeout(fallbackTimeout);
                    fallbackTimeout = null;
                }
                // Don't print arrow here - let the standalone trigger handle it
            } else {
                // First line after wstaje is not a tracking result - add prefix immediately
                inTrackingContext = false; // Done with this tracking context
                if (pendingWstajeContainer) {
                    prependToContainer(pendingWstajeContainer, '[Brak sladow] ', NOT_FOUND_COLOR);
                    pendingWstajeContainer = null;
                }
                // Clear the fallback timeout since we handled it
                if (fallbackTimeout) {
                    clearTimeout(fallbackTimeout);
                    fallbackTimeout = null;
                }
            }
            return line;
        },
        tag
    );

    // Combined pattern for all tracking messages - always prints arrow and colors direction
    client.Triggers.registerTrigger(
        /^Jest(?:es w stanie wyroznic kilka sladow na ziemi| ona? .*)\. Najswiezsze(?<race> zostaly pozostawione.*)? prowadza(?<unsure> prawdopodobnie)?(?: na)? (?<direction>.*)\.$/,
        (line, matches) => {
            const groups = matches.groups as { race?: string; unsure?: string; direction: string };
            const dir = groups.direction;

            let color;
            if (groups.race) {
                color = SURE_WITH_TRACE_COLOR;
            } else if (groups.unsure) {
                color = UNSURE_COLOR;
            } else {
                color = SURE_COLOR;
            }

            printArrow(client, dir, color);
            return colorTokenInLine(line, dir, color);
        },
        tag
    );
}
