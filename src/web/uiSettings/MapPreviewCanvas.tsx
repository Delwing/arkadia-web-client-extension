import { useEffect, useRef } from "react";
import type { MapRoomShape } from "../uiSettingsCore";

interface MapPreviewCanvasProps {
    id?: string;
    roomSize: number;
    lineWidth: number;
    roomShape: MapRoomShape;
    /** Shape of the overlay marker/highlight. Defaults to 'circle' (player marker behaviour). */
    markerShape?: MapRoomShape;
    strokeColor: string;
    fillColor: string;
    strokeAlpha: number;
    fillAlpha: number;
    strokeWidth: number;
    sizeFactor: number;
    dashEnabled: boolean;
}

/** Trace a centered shape path; size is the full width/height (diameter for circles). */
function traceShape(ctx: CanvasRenderingContext2D, shape: MapRoomShape, cx: number, cy: number, size: number) {
    ctx.beginPath();
    if (shape === 'circle') {
        ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
    } else if (shape === 'roundedRectangle') {
        const radius = size * 0.2; // 20% corner radius
        const x = cx - size / 2;
        const y = cy - size / 2;
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + size - radius, y);
        ctx.quadraticCurveTo(x + size, y, x + size, y + radius);
        ctx.lineTo(x + size, y + size - radius);
        ctx.quadraticCurveTo(x + size, y + size, x + size - radius, y + size);
        ctx.lineTo(x + radius, y + size);
        ctx.quadraticCurveTo(x, y + size, x, y + size - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
    } else {
        // rectangle (default)
        ctx.rect(cx - size / 2, cy - size / 2, size, size);
    }
}

/**
 * Live preview of a room + overlay marker, mirroring the map renderer.
 * Used for both the player marker (markerShape defaults to 'circle') and
 * room highlights (markerShape resolved from the highlight shape setting).
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
            roomSize, lineWidth, roomShape, markerShape = 'circle',
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
        traceShape(ctx, roomShape, centerX, centerY, scaledRoomSize);
        ctx.stroke();

        // Draw the overlay marker / highlight
        const markerSize = scaledRoomSize * sizeFactor;
        traceShape(ctx, markerShape, centerX, centerY, markerSize);

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
                id={props.id ?? 'ui-map-preview-canvas'}
                ref={canvasRef}
                width={200}
                height={100}
                style={{ border: '1px solid var(--surface-border)', borderRadius: '0.25rem', background: '#1a1a1a' }}
            />
        </div>
    );
}

export default MapPreviewCanvas;
