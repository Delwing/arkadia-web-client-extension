/**
 * Lower-cases and strips diacritics one UTF-16 unit at a time, so the result
 * has the same length as the input and match offsets map straight back onto
 * the original text (needed for highlight ranges).
 */
export function foldText(text: string): string {
    let out = "";
    for (let i = 0; i < text.length; i++) {
        const lower = text[i].toLowerCase();
        // l-stroke has no canonical decomposition, so NFD leaves it alone.
        if (lower === "ł") {
            out += "l";
            continue;
        }
        out += lower.normalize("NFD")[0] ?? text[i];
    }
    return out;
}
