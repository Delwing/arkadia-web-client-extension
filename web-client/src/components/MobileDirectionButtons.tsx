export function MobileDirectionButtons() {
    return (
        <div id="mobile-direction-buttons" className="mobile-direction-buttons">
            <button className="mobile-button mobile-button-text top-button" id="z-list-toggle">
                /z
            </button>
            <button className="mobile-button mobile-button-text top-button" id="zas-list-toggle">
                /za
            </button>
            <button className="mobile-button mobile-button-text top-button" id="go-button">
                /go
            </button>
            <button className="mobile-button mobile-button-text top-button" id="buttons-toggle">
                ⇩
            </button>
            <button className="mobile-button mobile-button-text top-button" id="bracket-right-button">
                ]
            </button>
            <button className="mobile-button mobile-button-text top-button" id="button-1">
                wesprzyj
            </button>
            <button className="mobile-button mobile-button-text top-button" id="button-2">
                /z cel
            </button>
            <button className="mobile-button mobile-button-text top-button" id="button-3">
                /zas cel
            </button>
            <button className="mobile-button direction-button" id="nw-button">
                ↖
            </button>
            <button className="mobile-button direction-button" id="n-button">
                ↑
            </button>
            <button className="mobile-button direction-button" id="ne-button">
                ↗
            </button>
            <button className="mobile-button mobile-button-text direction-button" id="u-button">
                u
            </button>
            <button className="mobile-button direction-button" id="w-button">
                ←
            </button>
            <button className="mobile-button mobile-button-text direction-button" id="c-button">
                zerknij
            </button>
            <button className="mobile-button direction-button" id="e-button">
                →
            </button>
            <button className="mobile-button mobile-button-text direction-button" id="d-button">
                d
            </button>
            <button className="mobile-button direction-button" id="sw-button">
                ↙
            </button>
            <button className="mobile-button direction-button" id="s-button">
                ↓
            </button>
            <button className="mobile-button direction-button" id="se-button">
                ↘
            </button>
            <button className="mobile-button mobile-button-text direction-button" id="special-exit-button" title="">
                3
            </button>
            <div id="z-buttons-list" className="mobile-z-buttons" />
            <div id="zas-buttons-list" className="mobile-z-buttons" />
            <div id="w-buttons-list" className="mobile-z-buttons" />
            <div id="prze-buttons-list" className="mobile-z-buttons" />
            <div id="idz-buttons-list" className="mobile-idz-buttons" />
        </div>
    );
}
