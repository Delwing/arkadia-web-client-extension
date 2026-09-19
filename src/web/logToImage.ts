import type { FlatLogLine } from "./logBrowserUtils";
import { downloadBlob, renderLogImage, type ImageStyle } from "@ui/logViewer/export/logImage";

/**
 * Saves the in-client log browser's lines as a PNG.
 *
 * The rendering itself lives in `@ui/logViewer/export/logImage` so the
 * design-system viewer can produce the same image; this wrapper only supplies
 * the styling, which it reads off the live `#logs-preview` element so the
 * picture matches what the player is looking at.
 */
function readPreviewStyle(): ImageStyle {
    const logsPreview = document.getElementById('logs-preview');
    const previewStyle = logsPreview
        ? window.getComputedStyle(logsPreview)
        : window.getComputedStyle(document.body);

    let timeColor = 'darkorange';
    if (logsPreview) {
        // The timestamp colour comes from a throwaway `.log-time` span rather
        // than a constant, so it follows the theme like everything else.
        const sampleTime = document.createElement('span');
        sampleTime.className = 'log-time';
        sampleTime.style.visibility = 'hidden';
        sampleTime.textContent = '00:00:00.000';
        logsPreview.appendChild(sampleTime);
        timeColor = window.getComputedStyle(sampleTime).color || timeColor;
        logsPreview.removeChild(sampleTime);
    }

    return {
        bgColor: previewStyle.backgroundColor || '#242424',
        defaultColor: previewStyle.color || '#ffffff',
        timeColor,
        fontSize: parseFloat(previewStyle.fontSize) || 14,
        fontFamily: previewStyle.fontFamily || 'monospace',
        containerWidth: logsPreview ? Math.max(200, logsPreview.clientWidth - 16) : 1000,
    };
}

export async function downloadLogAsImage(lines: FlatLogLine[], filename: string): Promise<void> {
    const blob = await renderLogImage(
        lines.map(line => ({ time: line.time, html: line.html })),
        readPreviewStyle(),
    );
    downloadBlob(blob, filename);
}
