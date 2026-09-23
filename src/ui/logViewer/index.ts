/**
 * Log viewer — public surface.
 *
 * The component is host-agnostic: it renders into whatever box it is given, so
 * the same code serves the standalone page and the window inside the client.
 * Hosts supply sessions and preference storage; everything else is internal.
 *
 * It carries its own palette and its own controls (`logViewerTheme.css`,
 * `ui/controls.css`) and reads nothing from the page around it — which is why
 * it looks the same on the Bootstrap-less standalone page and inside the
 * client's Bootstrap modal.
 */
export { LogViewer } from "./LogViewer";
export type { LogViewerProps } from "./LogViewer";

/** The host chrome the two hosts need in order to match the viewer. */
export { Button, Icon, IconButton, Spinner } from "./ui";
export type { IconName } from "./ui";

export {
    CHANNEL_META,
    CHANNELS,
    FALLBACK_CHANNEL,
    UNTYPED_CHANNEL,
    allChannelsOn,
    channelForType,
} from "./model/channels";
export type { Channel, ChannelFilter } from "./model/channels";

export {
    attributeCharacters,
    charactersLabel,
    findBannerMarks,
    loginBannerToken,
    matchCharacter,
    titleCase,
} from "./model/characters";
export type { Attribution, CharacterMark } from "./model/characters";

export { LOG_EVENT_KINDS, LOG_EVENT_META, detectEvent } from "./model/events";
export type { LogEventKind } from "./model/events";

export { formatClock, formatDateLong, formatDayLabel, formatDuration } from "./model/format";

export { hasLines } from "./model/types";
export type { LogLine, LogSession, LogSessionInfo, SearchScope } from "./model/types";
export type { PersistedPreferences } from "./model/viewerState";
