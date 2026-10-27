import React, { useEffect, useRef } from 'react';
import { getEmbeddedMap } from '../embedRegistry';

const WIDTH = 400;
const HEIGHT = 140;
const CELL = 22;
const ROOM = 12;
const DEPTH = 6;

interface PlacedRoom {
    id: number;
    x: number;
    y: number;
    exits: number[];
    color: string;
}

/** Rooms on the same area and level within a few steps of the target, walked through their exits. */
function collectNearby(roomId: number): PlacedRoom[] {
    const reader = getEmbeddedMap()?.reader;
    const origin = reader?.getRoom(roomId);
    if (!reader || !origin) return [];
    const placed = new Map<number, PlacedRoom>();
    let frontier = [roomId];
    for (let depth = 0; depth <= DEPTH && frontier.length > 0; depth++) {
        const next: number[] = [];
        for (const id of frontier) {
            if (placed.has(id)) continue;
            const room = reader.getRoom(id);
            if (!room || room.area !== origin.area || room.z !== origin.z) continue;
            const exits = Object.values(room.exits ?? {}) as number[];
            placed.set(id, {
                id,
                x: room.x - origin.x,
                // The reader already flips y to screen orientation (north is negative).
                y: room.y - origin.y,
                exits,
                color: reader.getColorValue?.(room.env) || '#6b7280',
            });
            next.push(...exits);
        }
        frontier = next;
    }
    return [...placed.values()];
}

/** A small map excerpt centred on one room, drawn once per room. */
export const PersonLocationMap: React.FC<{ roomId: number }> = ({ roomId }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = WIDTH * ratio;
        canvas.height = HEIGHT * ratio;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        const rooms = collectNearby(roomId);
        const byId = new Map(rooms.map(room => [room.id, room]));
        const at = (room: PlacedRoom) => ({ x: WIDTH / 2 + room.x * CELL, y: HEIGHT / 2 + room.y * CELL });

        const styles = getComputedStyle(canvas);
        ctx.strokeStyle = styles.getPropertyValue('--people-map-exit').trim() || '#4b5563';
        ctx.lineWidth = 2;
        for (const room of rooms) {
            for (const target of room.exits) {
                const other = byId.get(target);
                if (!other || other.id < room.id) continue;
                const a = at(room);
                const b = at(other);
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        }
        for (const room of rooms) {
            const { x, y } = at(room);
            ctx.fillStyle = room.color;
            ctx.globalAlpha = room.id === roomId ? 1 : 0.75;
            ctx.fillRect(x - ROOM / 2, y - ROOM / 2, ROOM, ROOM);
        }
        ctx.globalAlpha = 1;
        const accent = styles.getPropertyValue('--people-map-marker').trim() || '#6da7da';
        ctx.strokeStyle = accent;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(WIDTH / 2, HEIGHT / 2, ROOM, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }, [roomId]);

    return <canvas ref={canvasRef} className="people-panel__map" />;
};
