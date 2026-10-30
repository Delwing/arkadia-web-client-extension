/**
 * CORS and response helpers.
 *
 * Mirrors the shape of the AI Worker's helpers so the two read alike; kept as a
 * separate copy on purpose (see README.md).
 */

import { isOriginAllowed } from './config';
import type { ErrorStatus } from './types';

export function corsHeaders(
    origin: string | null,
    allowed: string[],
): Record<string, string> {
    const allowOrigin = origin && isOriginAllowed(origin, allowed) ? origin : (allowed[0] ?? '*');
    return {
        'access-control-allow-origin': allowOrigin,
        'access-control-allow-methods': 'POST, GET, OPTIONS',
        // `authorization` carries the account's bearer credential. Without it
        // the preflight rejects every authenticated request before the Worker
        // ever runs, which presents as the route not existing.
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '86400',
        // Responses vary by Origin; without this a shared cache could serve one
        // origin's CORS headers to another.
        vary: 'Origin',
    };
}

export function json(
    payload: unknown,
    status: number,
    origin: string | null,
    allowed: string[],
    extra: Record<string, string> = {},
): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: {
            ...corsHeaders(origin, allowed),
            'content-type': 'application/json; charset=utf-8',
            ...extra,
        },
    });
}

export function errorResponse(
    status: ErrorStatus,
    message: string,
    httpStatus: number,
    origin: string | null,
    allowed: string[],
    retryAfter?: number,
): Response {
    return json(
        { status, message, ...(retryAfter ? { retryAfter } : {}) },
        httpStatus,
        origin,
        allowed,
        retryAfter ? { 'retry-after': String(retryAfter) } : {},
    );
}
