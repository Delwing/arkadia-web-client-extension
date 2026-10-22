/**
 * CORS and response helpers. Same shape as the push Worker's, kept as a copy.
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
        'access-control-allow-headers': 'authorization, content-type',
        'access-control-max-age': '86400',
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
): Response {
    return json({ status, message }, httpStatus, origin, allowed);
}
