import Client from "../Client";

export default function initSoundAliases(client: Client, aliases: { pattern: RegExp; callback: Function }[]) {
    aliases.push({
        pattern: /^\/sounds$/,
        callback: () => {
            const muted = client.SoundManager.toggleMute();
            client.print(muted ? 'Dzwieki wyciszone.' : 'Dzwieki wlaczone.');
        }
    });
    aliases.push({
        pattern: /^\/mute$/,
        callback: () => {
            client.SoundManager.mute();
            client.print('Dzwieki wyciszone.');
        }
    });
    aliases.push({
        pattern: /^\/unmute$/,
        callback: () => {
            client.SoundManager.unmute();
            client.print('Dzwieki wlaczone.');
        }
    });
}
