export function uncompress(b64: string) {
    const normalized = b64.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(normalized);
    const input = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) input[i] = bin.charCodeAt(i);
    let inflated: AllowSharedBufferSource;
    try {
        // @ts-ignore
        inflated = pako.inflate(input);    // deflate/zlib
    } catch (_) {
        // @ts-ignore
        inflated = pako.ungzip(input);     // gzip fallback
    }

    return new TextDecoder('utf-8').decode(inflated);
}
