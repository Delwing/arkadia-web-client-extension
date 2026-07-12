/**
 * Off-screen SVG symbol library. Vital gems and command knots reference these
 * by id via <use href="#..."> — the shapes are defined once here.
 */
export default function IconDefs() {
    return (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
            <defs>
                <g id="i-hp" fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
                    <path d="M10 16.8C10 16.8 3.2 12.4 3.2 7.6A3.4 3.4 0 0 1 10 5.9 3.4 3.4 0 0 1 16.8 7.6C16.8 12.4 10 16.8 10 16.8Z" />
                </g>
                <g id="i-zm" fill="none" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round">
                    <circle cx="12.6" cy="4" r="2" />
                    <path d="M11.7 5.9 9 11" />
                    <path d="M9 11 12 12.6 12.4 15.8" />
                    <path d="M9 11 6.6 13.9 4.7 15.6" />
                    <path d="M11 6.7 14 7.3 13.4 9.4" />
                    <path d="M11 6.7 8.4 7.1 7 9" />
                    <path d="M2 7h3.2M1.4 10.5h3M2 14h3.2" />
                </g>
                <g id="i-hun" fill="none" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M3 9h14a7 7 0 0 1-14 0z" />
                    <path d="M8 5c-.8-1 .4-2 0-3M11 5c-.8-1 .4-2 0-3M17 12H3" />
                </g>
                <g id="i-obc" fill="none" strokeWidth="1.4" strokeLinejoin="round">
                    <path d="M6.5 8a3.5 3.5 0 0 1 7 0v8.5h-7z" />
                    <path d="M6.5 11.5h7M9 8.2h2v2.3H9z" />
                </g>
                <g id="i-thi" fill="none" strokeWidth="1.5" strokeLinejoin="round">
                    <path d="M10 2s5 6 5 9.5A5 5 0 0 1 5 11.5C5 8 10 2 10 2z" />
                    <path d="M7.5 11a2.5 2.5 0 0 0 2.5 2.5" />
                </g>
                <g id="i-mana" fill="none" strokeWidth="1.4" strokeLinejoin="round">
                    <path d="M10 2.5l1.7 5.8 5.8 1.7-5.8 1.7L10 17.5l-1.7-5.8L2.5 10l5.8-1.7z" />
                </g>
                <g id="i-pos" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 11l5-5 5 5M5 15.5l5-5 5 5" />
                </g>
                <g id="i-for" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 6h4a3 3 0 0 1 3 3c0 3 2 4 4 4v3h-4a4 4 0 0 1-4-4" />
                    <path d="M4 6v4" />
                </g>
                <g id="i-upi" fill="none" strokeWidth="1.4" strokeLinejoin="round">
                    <path d="M5 5h8v11H5zM13 7h2.5v4H13" />
                    <path d="M5 8h8" />
                </g>
                <g id="i-kac" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="10" cy="11" r="4.5" />
                    <path d="M10 3.5v-1.2M6 4.2l-.7-1M14 4.2l.7-1" />
                </g>
                <g id="i-pan" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 3l7 13H3z" />
                    <path d="M10 8.5v3.5M10 14.2v.1" />
                </g>
                <g id="i-sun" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="10" cy="10" r="3.6" />
                    <path d="M10 2.2v2.3M10 15.5v2.3M2.2 10h2.3M15.5 10h2.3M4.5 4.5l1.6 1.6M13.9 13.9l1.6 1.6M15.5 4.5l-1.6 1.6M6.1 13.9l-1.6 1.6" />
                </g>
                <g id="i-moon" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15.5 11.4A6.2 6.2 0 0 1 8.6 4.5 6.2 6.2 0 1 0 15.5 11.4Z" />
                </g>
                <g id="i-sword" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2.5V12" />
                    <path d="M6.8 12h6.4" />
                    <path d="M10 12v4.4" />
                    <path d="M8.3 16.6h3.4" />
                </g>
                <g id="i-shield" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2.6 4.8 4.4v5c0 3.7 2.4 6.3 5.2 7.6 2.8-1.3 5.2-3.9 5.2-7.6v-5z" />
                </g>
                <g id="i-banner" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M6 3v14.5" />
                    <path d="M6 3.5h9l-2.4 3.2 2.4 3.2H6" />
                </g>
                <g id="i-release" fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 6l5 4 5-4" />
                    <path d="M5 11l5 4 5-4" />
                </g>
                {/* bare interlace, no frame — the frame read as a button border */}
                <g id="knot" fill="none" strokeWidth="1.6" strokeLinecap="round">
                    <path d="M8 3v6a4 4 0 0 0 4 4 4 4 0 0 0 4-4V3M3 8h6a4 4 0 0 1 4 4 4 4 0 0 1-4 4H3M23 8h-6a4 4 0 0 0-4 4 4 4 0 0 0 4 4h6M8 23v-6a4 4 0 0 1 4-4" />
                </g>

                {/* Occupational-guild emblems for the character plaque (charPlaque.ts).
                    Drawn on a 0-20 grid at a hairline 1.15 stroke; `e-crest` is the
                    neutral fallback for an unmapped or absent guild. */}
                <g id="e-hammer" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5.4 5.2h9.2a1 1 0 0 1 1 1v2.6a1 1 0 0 1-1 1H5.4a1 1 0 0 1-1-1V6.2a1 1 0 0 1 1-1z" />
                    <path d="M7.6 5.2v4.6M12.4 5.2v4.6" />
                    <path d="M10 9.8V17" />
                </g>
                <g id="e-flame" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2.4s4.2 4.2 4.2 8.1a4.2 4.2 0 0 1-8.4 0c0-1.6 1-2.9 1-2.9.3 1 .9 1.5.9 1.5.1-2.1 2.3-4.7 2.3-6.8z" />
                    <path d="M10 16.6a2.3 2.3 0 0 0 2.3-2.3c0-1.3-1.3-2.4-1.3-2.4" />
                </g>
                <g id="e-morningstar" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5.4 16.6 9.5 10.4" />
                    <circle cx="11.6" cy="8" r="3.1" />
                    <path d="M11.6 3v1.9M11.6 11.1V13M6.5 8h1.9M14.8 8h1.9M8 4.4l1.35 1.35M15.2 4.4l-1.35 1.35M8 11.6l1.35-1.35M15.2 11.6l-1.35-1.35" />
                </g>
                <g id="e-anchor" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="10" cy="3.7" r="1.5" />
                    <path d="M10 5.2V16.6" />
                    <path d="M6.5 8h7" />
                    <path d="M4.2 12.2a5.8 5.8 0 0 0 11.6 0" />
                    <path d="M4.2 12.2 2.7 11M4.2 12.2l1.9.3M15.8 12.2 17.3 11M15.8 12.2l-1.9.3" />
                </g>
                <g id="e-greatsword" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2.4v9.4" />
                    <path d="M5.4 11.8h9.2" />
                    <path d="M10 11.8v4" />
                    <path d="M8.3 15.8h3.4" />
                    <path d="M6.6 10.4 5.4 11.8 6.6 13.2M13.4 10.4 14.6 11.8 13.4 13.2" />
                </g>
                <g id="e-swordshield" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5.9 3.6 2.9 4.6v3.2c0 2.5 1.5 4.1 3 4.9 1.5-.8 3-2.4 3-4.9V4.6z" />
                    <path d="M13.4 2.2V12" />
                    <path d="M10.8 12h5.2" />
                    <path d="M13.4 12v4.4" />
                    <path d="M12.1 16.4h2.6" />
                </g>
                <g id="e-daggers" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <g transform="rotate(40 10 6)">
                        <path d="M10 1.8 8.8 11.6 11.2 11.6z" />
                        <path d="M7.7 11.6h4.6" />
                        <path d="M10 11.6v3.4" />
                        <path d="M8.8 15h2.4" />
                    </g>
                    <g transform="rotate(-40 10 6)">
                        <path d="M10 1.8 8.8 11.6 11.2 11.6z" />
                        <path d="M7.7 11.6h4.6" />
                        <path d="M10 11.6v3.4" />
                        <path d="M8.8 15h2.4" />
                    </g>
                </g>
                <g id="e-arrows" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <g transform="rotate(45 10 10)">
                        <path d="M10 2.6v14.8" />
                        <path d="M10 2.6 8.4 4.7M10 2.6 11.6 4.7" />
                        <path d="M8.6 15.2 10 13.6 11.4 15.2M8.6 13.6 10 12 11.4 13.6" />
                    </g>
                    <g transform="rotate(-45 10 10)">
                        <path d="M10 2.6v14.8" />
                        <path d="M10 2.6 8.4 4.7M10 2.6 11.6 4.7" />
                        <path d="M8.6 15.2 10 13.6 11.4 15.2M8.6 13.6 10 12 11.4 13.6" />
                    </g>
                </g>
                <g id="e-spear" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2.2C9 4.1 8.1 5.7 8.1 7 8.1 8.2 9 8.8 10 8.8 11 8.8 11.9 8.2 11.9 7 11.9 5.7 11 4.1 10 2.2z" />
                    <path d="M10 8.8V17.6" />
                    <path d="M8.5 9.4h3" />
                </g>
                <g id="e-scales" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="10" cy="3.4" r="1" />
                    <path d="M10 4.4V15.2" />
                    <path d="M7.2 15.2h5.6" />
                    <path d="M3.6 6.2h12.8" />
                    <path d="M3.6 6.2 2 9.6h3.2zM16.4 6.2 14.8 9.6h3.2z" />
                </g>
                <g id="e-bow" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.8 2.8a9.2 9.2 0 0 1 0 14.4" />
                    <path d="M7.8 2.8v14.4" />
                    <path d="M2.4 10H17.2" />
                    <path d="M17.2 10 14.7 8.3M17.2 10 14.7 11.7" />
                    <path d="M2.4 8.4 4.2 10 2.4 11.6M3.9 8.4 5.7 10 3.9 11.6" />
                </g>
                <g id="e-compass" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="10" cy="10" r="7" />
                    <path d="M10 3.2v1.6" />
                    <path d="M10 5 11.7 10 10 15 8.3 10z" />
                    <circle cx="10" cy="10" r=".7" />
                </g>
                <g id="e-crest" fill="none" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 2.5 11.7 8.3 17.5 10 11.7 11.7 10 17.5 8.3 11.7 2.5 10 8.3 8.3z" />
                </g>
            </defs>
        </svg>
    );
}
