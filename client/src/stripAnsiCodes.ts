const ANSI_SEQUENCE_PATTERN = "[\\u001b\\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]";
const CLICK_OPEN_PATTERN = "\\{clickOpen:\\d+(?::[^}]+)?\\}";
const CLICK_CLOSE_PATTERN = "\\{clickClose\\}";

const PATTERN_SOURCE = `${ANSI_SEQUENCE_PATTERN}|${CLICK_OPEN_PATTERN}|${CLICK_CLOSE_PATTERN}`;

export const createAnsiClickPattern = (flags = "g"): RegExp => new RegExp(PATTERN_SOURCE, flags);

const STRIP_PATTERN = createAnsiClickPattern();

export const stripAnsiCodes = (str: string): string => str.replace(STRIP_PATTERN, "");

export const ansiPatternSource = PATTERN_SOURCE;
