import { useEffect, useRef } from "react";
import type { MapRoomShape } from "../uiSettingsCore";

interface MapPreviewCanvasProps {
    roomSize: number;
    lineWidth: number;
    roomShape: MapRoomShape;
    strokeColor: string;
    fillColor: string;
    strokeAlpha: number;
    fillAlpha: number;
    strokeWidth: number;
    sizeFactor: number;
    dashEnabled: boolean;
}

/**
 * Live preview of a room + player marker, mirroring the map renderer.
 * Ported verbatim from the former imperative `drawPreview()`.
 */
function MapPreviewCanvas(props: MapPreviewCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const {
            roomSize, lineWidth, roomShape,
            strokeColor, fillColor, strokeAlpha, fillAlpha,
            strokeWidth, sizeFactor, dashEnabled,
        } = props;

        // Scale for rendering (base size in pixels)
        const baseSize = 40;
        const scaledRoomSize = baseSize * roomSize;
        const scaledLineWidth = baseSize * lineWidth;
        const centerX = width / 2;
        const centerY = height / 2;

        // Draw sample room based on shape
        ctx.strokeStyle = '#888';
        ctx.lineWidth = scaledLineWidth;

        if (roomShape === 'circle') {
            ctx.beginPath();
            ctx.arc(centerX, centerY, scaledRoomSize / 2, 0, Math.PI * 2);
            ctx.stroke();
        } else if (roomShape === 'roundedRectangle') {
            const radius = scaledRoomSize * 0.2; // 20% corner radius
            const x = centerX - scaledRoomSize / 2;
            const y = centerY - scaledRoomSize / 2;
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + scaledRoomSize - radius, y);
            ctx.quadraticCurveTo(x + scaledRoomSize, y, x + scaledRoomSize, y + radius);
            ctx.lineTo(x + scaledRoomSize, y + scaledRoomSize - radius);
            ctx.quadraticCurveTo(x + scaledRoomSize, y + scaledRoomSize, x + scaledRoomSize - radius, y + scaledRoomSize);
            ctx.lineTo(x + radius, y + scaledRoomSize);
            ctx.quadraticCurveTo(x, y + scaledRoomSize, x, y + scaledRoomSize - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
            ctx.stroke();
        } else {
            // rectangle (default)
            ctx.strokeRect(
                centerX - scaledRoomSize / 2,
                centerY - scaledRoomSize / 2,
                scaledRoomSize,
                scaledRoomSize
            );
        }

        // Draw player marker (circle)
        const markerRadius = (scaledRoomSize / 2) * sizeFactor;

        ctx.beginPath();
        ctx.arc(centerX, centerY, markerRadius, 0, Math.PI * 2);

        // Fill
        if (fillAlpha > 0) {
            ctx.fillStyle = fillColor + Math.round(fillAlpha * 255).toString(16).padStart(2, '0');
            ctx.fill();
        }

        // Stroke
        if (strokeAlpha > 0) {
            ctx.strokeStyle = strokeColor + Math.round(strokeAlpha * 255).toString(16).padStart(2, '0');
            ctx.lineWidth = scaledRoomSize * strokeWidth;

            if (dashEnabled) {
                // Match the actual renderer's dash pattern [0.05, 0.05] in map units
                const dashLength = scaledRoomSize * 0.05;
                ctx.setLineDash([dashLength, dashLength]);
            } else {
                ctx.setLineDash([]);
            }

            ctx.stroke();
        }

        ctx.setLineDash([]);
    });

    return (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
            <canvas
                id="ui-map-preview-canvas"
                ref={canvasRef}
                width={200}
                height={100}
                style={{ border: '1px solid var(--surface-border)', borderRadius: '0.25rem', background: '#1a1a1a' }}
            />
        </div>
    );
}

export default MapPreviewCanvas;
