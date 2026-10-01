import { Button, Icon, Menu, MenuCheckItem, MenuItem, MenuSeparator } from "../ui";
import { CHANNEL_META, CHANNELS, type Channel, type ChannelFilter } from "../model/channels";

export interface ChannelMenuProps {
    channels: ChannelFilter;
    counts: Record<Channel, number>;
    onToggle: (channel: Channel, on: boolean) => void;
    onShowAll: () => void;
}

/**
 * The eight channel filters as one button.
 *
 * It used to be a bar of eight chips with counts on a wide screen, which was a
 * whole row of controls above the log that most players never touch. A menu
 * costs one control, still says when something is filtered ("Kanały 6/8", in
 * the accent), and gives every channel a full-width row to be tapped.
 */
export function ChannelMenu({ channels, counts, onToggle, onShowAll }: ChannelMenuProps) {
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
                    title="Które kanały są widoczne"
                >
                    {filtered ? `Kanały ${on}/${CHANNELS.length}` : "Kanały"}
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
                    <MenuItem onSelect={onShowAll}>Pokaż wszystkie</MenuItem>
                </>
            ) : null}
        </Menu>
    );
}
