import type { CoinMetal } from './coinMetal';

/** The colours the game output paints the coins in (`@client/constants/colors.ts`); copper a touch brighter, so the small disc reads as copper */
const COIN_COLORS: Record<CoinMetal, string> = {
    mithril: '#afeeee',
    gold: '#ffd700',
    silver: '#dadada',
    copper: '#c87533',
};

const COIN_TITLES: Record<CoinMetal, string> = {
    mithril: 'mithryl',
    gold: 'złoto',
    silver: 'srebro',
    copper: 'miedź',
};

/** A small coin in the metal's colour, sized to the text around it */
export function CoinIcon({ metal, size = '1em', title }: { metal: CoinMetal; size?: number | string; title?: string }) {
    const color = COIN_COLORS[metal];
    return (
        <svg
            className={`coin-icon coin-icon--${metal}`}
            width={size}
            height={size}
            viewBox="0 0 16 16"
            role="img"
        >
            <title>{title ?? COIN_TITLES[metal]}</title>
            <circle cx="8" cy="8" r="7" fill={color} stroke="rgba(0, 0, 0, 0.45)" strokeWidth="1" />
            <circle cx="8" cy="8" r="4.6" fill="none" stroke="rgba(0, 0, 0, 0.28)" strokeWidth="1" />
            <path d="M5.2 4.4 A4.6 4.6 0 0 1 9.6 3.6" fill="none" stroke="rgba(255, 255, 255, 0.65)" strokeWidth="1" strokeLinecap="round" />
        </svg>
    );
}
