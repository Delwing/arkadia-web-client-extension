function hexToRgb(hex: string): [number, number, number] {
    const value = parseInt(hex.replace(/^#/, ''), 16);
    return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

export const colorCodes = {
    xterm: ["#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0", "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff", "#000000", "#00005f", "#000087", "#0000af", "#0000df", "#0000ff", "#005f00", "#005f5f", "#005f87", "#005faf", "#005fdf", "#005fff", "#008700", "#00875f", "#008787", "#0087af", "#0087df", "#0087ff", "#00af00", "#00af5f", "#00af87", "#00afaf", "#00afdf", "#00afff", "#00df00", "#00df5f", "#00df87", "#00dfaf", "#00dfdf", "#00dfff", "#00ff00", "#00ff5f", "#00ff87", "#00ffaf", "#00ffdf", "#00ffff", "#5f0000", "#5f005f", "#5f0087", "#5f00af", "#5f00df", "#5f00ff", "#5f5f00", "#5f5f5f", "#5f5f87", "#5f5faf", "#5f5fdf", "#5f5fff", "#5f8700", "#5f875f", "#5f8787", "#5f87af", "#5f87df", "#5f87ff", "#5faf00", "#5faf5f", "#5faf87", "#5fafaf", "#5fafdf", "#5fafff", "#5fdf00", "#5fdf5f", "#5fdf87", "#5fdfaf", "#5fdfdf", "#5fdfff", "#5fff00", "#5fff5f", "#5fff87", "#5fffaf", "#5fffdf", "#5fffff", "#870000", "#87005f", "#870087", "#8700af", "#8700df", "#8700ff", "#875f00", "#875f5f", "#875f87", "#875faf", "#875fdf", "#875fff", "#878700", "#87875f", "#878787", "#8787af", "#8787df", "#8787ff", "#87af00", "#87af5f", "#87af87", "#87afaf", "#87afdf", "#87afff", "#87df00", "#87df5f", "#87df87", "#87dfaf", "#87dfdf", "#87dfff", "#87ff00", "#87ff5f", "#87ff87", "#87ffaf", "#87ffdf", "#87ffff", "#af0000", "#af005f", "#af0087", "#af00af", "#af00df", "#af00ff", "#af5f00", "#af5f5f", "#af5f87", "#af5faf", "#af5fdf", "#af5fff", "#af8700", "#af875f", "#af8787", "#af87af", "#af87df", "#af87ff", "#afaf00", "#afaf5f", "#afaf87", "#afafaf", "#afafdf", "#afafff", "#afdf00", "#afdf5f", "#afdf87", "#afdfaf", "#afdfdf", "#afdfff", "#afff00", "#afff5f", "#afff87", "#afffaf", "#afffdf", "#afffff", "#df0000", "#df005f", "#df0087", "#df00af", "#df00df", "#df00ff", "#df5f00", "#df5f5f", "#df5f87", "#df5faf", "#df5fdf", "#df5fff", "#df8700", "#df875f", "#df8787", "#df87af", "#df87df", "#df87ff", "#dfaf00", "#dfaf5f", "#dfaf87", "#dfafaf", "#dfafdf", "#dfafff", "#dfdf00", "#dfdf5f", "#dfdf87", "#dfdfaf", "#dfdfdf", "#dfdfff", "#dfff00", "#dfff5f", "#dfff87", "#dfffaf", "#dfffdf", "#dfffff", "#ff0000", "#ff005f", "#ff0087", "#ff00af", "#ff00df", "#ff00ff", "#ff5f00", "#ff5f5f", "#ff5f87", "#ff5faf", "#ff5fdf", "#ff5fff", "#ff8700", "#ff875f", "#ff8787", "#ff87af", "#ff87df", "#ff87ff", "#ffaf00", "#ffaf5f", "#ffaf87", "#ffafaf", "#ffafdf", "#ffafff", "#ffdf00", "#ffdf5f", "#ffdf87", "#ffdfaf", "#ffdfdf", "#ffdfff", "#ffff00", "#ffff5f", "#ffff87", "#ffffaf", "#ffffdf", "#ffffff", "#080808", "#121212", "#1c1c1c", "#262626", "#303030", "#3a3a3a", "#444444", "#4e4e4e", "#585858", "#606060", "#666666", "#767676", "#808080", "#8a8a8a", "#949494", "#9e9e9e", "#a8a8a8", "#b2b2b2", "#bcbcbc", "#c6c6c6", "#d0d0d0", "#dadada", "#e4e4e4", "#eeeeee"],
    ansi: {
        bright: ["#555555", "#ff5555", "#55ff55", "#ffff55", "#5555ff", "#ff55ff", "#55ffff", "#ffffff"],
        dark: ["#000000", "#bb0000", "#00bb00", "#bbbb00", "#0000bb", "#bb00bb", "#00bbbb", "#bbbbbb"]
    }
}

export const RESET = '\x1B[0m'

export function color(colorCode:number) {
    return `\x1B[22;38;5;${colorCode}m`
}

export function colorString(string: string, colorCode: number) {
    return color(colorCode) + string + RESET;
}

export function colorStringInLine(rawLine: string, string: string, colorCode: number) {
    const matchIndex = rawLine.indexOf(string)
    if (matchIndex === -1) {
        return rawLine
    }
    return rawLine.substring(0, matchIndex) + color(colorCode) + string + RESET + rawLine.substring(matchIndex + string.length)
}

export function findClosestColor(hex: string | number[]): number {
    const targetRgb = Array.isArray(hex) ? hex : hexToRgb(hex)
    let distance = 99999999999999
    let currentPick: number = 0;
    colorCodes.xterm.forEach((colorsKey, index) => {
        const rgb = hexToRgb(colorsKey)
        const compDistance = Math.pow(targetRgb[0] - rgb[0], 2) + Math.pow(targetRgb[1] - rgb[1], 2) + Math.pow(targetRgb[2] - rgb[2], 2)
        if (compDistance < distance) {
            currentPick = index
            distance = compDistance
        }
    })
    return currentPick + 1
}