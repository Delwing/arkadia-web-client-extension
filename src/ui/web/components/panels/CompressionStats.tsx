import { useState } from "react";
import { useClientEvent } from "../../hooks";

interface MccpStatsData {
    active: boolean;
    compressedBytes: number;
    decompressedBytes: number;
    ratio: number;
    savedBytes: number;
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const CompressionStats: React.FC = () => {
    const [stats, setStats] = useState<MccpStatsData | null>(null);

    useClientEvent("mccp.stats", (newStats) => {
        setStats(newStats);
    });

    if (!stats?.active) {
        return null;
    }

    const ratioPercent = Math.round(stats.ratio * 100);
    const title = `MCCP2: ${formatBytes(stats.compressedBytes)} → ${formatBytes(stats.decompressedBytes)} (oszczędność: ${formatBytes(stats.savedBytes)})`;

    return (
        <span title={title} style={{ color: "#8bc34a" }}>
            MCCP: {ratioPercent}%
        </span>
    );
};

export default CompressionStats;
