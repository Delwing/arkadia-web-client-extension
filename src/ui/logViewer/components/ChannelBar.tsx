import { Button, Chip } from "../ui";
import { anyChannelOff, CHANNEL_META, CHANNELS, type Channel, type ChannelFilter } from "../model/channels";

export interface ChannelBarProps {
    channels: ChannelFilter;
    counts: Record<Channel, number>;
    onToggle: (channel: Channel, on: boolean) => void;
    onShowAll: () => void;
}

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
