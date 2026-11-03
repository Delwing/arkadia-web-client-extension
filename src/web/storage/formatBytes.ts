const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;

/** "531,7 MB", "2 GB", "12 kB": the largest unit under the value, one decimal at most. */
export function formatBytes(bytes: number): string {
    const [value, unit] = bytes >= GB ? [bytes / GB, "GB"] : bytes >= MB || bytes === 0 ? [bytes / MB, "MB"] : [bytes / KB, "kB"];
    return `${value.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} ${unit}`;
}
