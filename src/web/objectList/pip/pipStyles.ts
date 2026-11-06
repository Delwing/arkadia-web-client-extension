// The stylesheet injected into the object list's Picture-in-Picture window,
// which has none of the page's own.

export const PIP_STYLE_MARKER = "data-objects-list-pip";

export const PIP_STYLES = `:root { color-scheme: dark; }
html, body {
    margin: 0;
    height: 100%;
}
#objects-list-pip {
    white-space: pre;
    box-sizing: border-box;
    max-width: 100vw;
    overflow-x: hidden;
    height: 100%;
    display: flex;
    flex-direction: column;
}
#objects-list-pip .objects-list-pip-body {
    flex: 1 1 auto;
    overflow-y: auto;
    white-space: inherit;
}
#objects-list-pip .objects-list-pip-header {
    display: block;
    font-weight: 600;
    margin-bottom: 0.35rem;
}
#objects-list-pip .objects-list-pip-footer {
    display: block;
    margin-top: 0.35rem;
    color: #d0d0d0;
}
#objects-list-pip .objects-list-pip-footer-content {
    display: block;
}
#objects-list-pip .object-num,
#objects-list-pip .object-desc,
#objects-list-pip .object-hp-bar,
#objects-list-pip .object-hp-bar-teammate {
    cursor: pointer;
}
#objects-list-pip .target-dot {
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.15s ease;
}
#objects-list-pip .target-dot:hover {
    opacity: 1;
}
#objects-list-pip .target-dot.target-dot-active {
    opacity: 1;
}
#objects-list-pip .team-not-attacking {
    display: inline-block;
    transform: skewX(-10deg);
}
#objects-list-pip .object-desc.is-covered-us,
#objects-list-pip .object-desc.is-covered-team {
    position: relative;
}
#objects-list-pip .is-covered-us .cover-name {
    opacity: 0.5;
}
#objects-list-pip .cover-mark {
    position: absolute;
    left: 100%;
    top: 50%;
    width: 0.95em;
    height: 0.95em;
    margin-left: 0.5ch;
    transform: translateY(-50%);
}
#objects-list-pip .cover-mark path {
    stroke-width: 2.2;
    stroke-linejoin: round;
}
#objects-list-pip .cover-mark--us path {
    fill: #de9822;
    stroke: #de9822;
}
#objects-list-pip .cover-mark--team path {
    fill: none;
    stroke: #8fb4d9;
}`;
