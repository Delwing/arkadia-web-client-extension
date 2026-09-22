/** Which keyboard the user has in front of them: a Mac one, or a PC one. */
export const IS_MAC = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
