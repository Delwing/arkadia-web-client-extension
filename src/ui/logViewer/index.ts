/**
 * Log viewer — public surface.
 *
 * The component is host-agnostic: it renders into whatever box it is given, so
 * the same code serves the standalone page and (later) a modal inside the
 * client. Hosts supply sessions and preference storage; everything else is
 * internal.
 */
export { LogViewer } from "./LogViewer";
export type { LogViewerProps } from "./LogViewer";

export { CHANNEL_META, CHANNELS, allChannelsOn, channelForType } from "./model/channels";
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

export type { Density, LogLine, LogSession, SearchScope } from "./model/types";
export type { PersistedPreferences } from "./model/viewerState";
