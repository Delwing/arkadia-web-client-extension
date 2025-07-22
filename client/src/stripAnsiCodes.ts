export const stripAnsiCodes = (str: string): string =>
    str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]|{clickOpen:\d+(?::[^}]+)?}|{clickClose}/g, "");
