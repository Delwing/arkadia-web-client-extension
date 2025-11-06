import {AnsiAwareBuffer} from "@client/ansi/FormatState";

export const stripAnsiCodes = (str: string | AnsiAwareBuffer): string => {
    const text = typeof str === 'string' ? str : str.text;
    return text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|{clickOpen:\d+(?::[^}]+)?}|{clickClose}/g, "");
};
