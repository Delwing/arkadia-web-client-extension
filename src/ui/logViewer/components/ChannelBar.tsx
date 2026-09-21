import { Button, Chip, Icon, Menu, MenuCheckItem, MenuItem, MenuSeparator } from "../ui";
import {
    anyChannelOff,
    CHANNEL_META,
    CHANNELS,
    type Channel,
    type ChannelFilter,
} from "../model/channels";

export interface ChannelBarProps {
    channels: ChannelFilter;
    counts: Record<Channel, number>;
    onToggle: (channel: Channel, on: boolean) => void;
    onShowAll: () => void;
}

/** Eight chips with their counts. The wide-screen representation. */
export function ChannelBar({ channels, counts, onToggle, onShowAll }: ChannelBarProps) {
    return (
        <div className="lv-channels">
            <span className="lv-channels__label">Kanaly</span>
            {CHANNELS.map((channel) => (
                <Chip
                    key={channel}
                    label={CHANNEL_META[channel].label}
                    count={counts[channel] ?? 0}
                    pressed={channels[channel]}
                    onPressedChange={(on) => onToggle(channel, on)}
                    dotColor={CHANNEL_META[channel].colorToken}
                />
            ))}
            {anyChannelOff(channels) ? (
                <Button variant="link" size="sm" onClick={onShowAll}>
                    Pokaz wszystkie
                </Button>
            ) : null}
        </div>
    );
}

/**
 * The same eight filters as one button.
 *
 * Eight chips do not fit a phone: wrapped they took four rows off the top of
 * the log, and in a single scrolling row the last ones were cut off with
 * nothing to say there was more. A menu costs one control, states how many
 * channels are on, and gives every channel a full-width row to be tapped.
 */
export function ChannelMenu({ channels, counts, onToggle, onShowAll }: ChannelBarProps) {
    const on = CHANNELS.filter((channel) => channels[channel]).length;
    const filtered = on < CHANNELS.length;

    return (
        <Menu
            align="end"
            trigger={
                <Button
                    size="sm"
                    variant={filtered ? "solid" : "soft"}
                    trailing={<Icon name="chevron-down" size={14} />}
                    title="Ktore kanaly sa widoczne"
                >
                    {filtered ? `Kanaly ${on}/${CHANNELS.length}` : "Kanaly"}
                </Button>
            }
        >
            {CHANNELS.map((channel) => (
                <MenuCheckItem
                    key={channel}
                    checked={channels[channel]}
                    label={CHANNEL_META[channel].label}
                    count={counts[channel] ?? 0}
                    dotColor={CHANNEL_META[channel].colorToken}
                    onToggle={() => onToggle(channel, !channels[channel])}
                />
            ))}
            {filtered ? (
                <>
                    <MenuSeparator />
                    <MenuItem onSelect={onShowAll}>Pokaz wszystkie</MenuItem>
                </>
            ) : null}
        </Menu>
    );
}
