export const TELNET_OPTION_REGEX = /\u00FF\u00FA.*?\u00FF\u00F0|\u00FF.[^\u00FF]/g;
export const GMCP_COMMAND_CODE = 201;
export const GMCP_IAC = "\xFF";
export const GMCP_SB = "\xFA";
export const GMCP_SE = "\xF0";

// MCCP2 (Mud Client Compression Protocol v2)
export const MCCP2_OPTION = 0x56; // Telnet option 86
