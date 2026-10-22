/**
 * Runtime configuration, read from Worker vars.
 *
 * A separate copy of the push Worker's equivalent on purpose: the Workers share
 * conventions, not code, so that neither can break the other's deploy.
 */

import type { Env } from './types';

export interface RuntimeConfig {
    allowedOrigins: string[];
    maxItemsPerDay: number;
    maxConfirmations: number;
    maxRegistrationsPerIp: number;
}

const DEFAULTS = {
    // A long-time player's zlom list runs to a few thousand entries, and the
    // first sync sends all of it, so a day has to fit one whole list.
    maxItemsPerDay: 20_000,
    // Two agreeing players settle a version; five leaves room to outvote one
    // bad source without spending a write per player forever.
    maxConfirmations: 5,
    maxRegistrationsPerIp: 5,
} as const;

function parseList(value: string | undefined): string[] {
    if (!value) return [];
    return value
        .split(',')
        .map(entry => entry.trim())
        .filter(Boolean);
}

function parseNumber(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadConfig(env: Env): RuntimeConfig {
    return {
        allowedOrigins: parseList(env.ALLOWED_ORIGINS),
        maxItemsPerDay: parseNumber(env.MAX_ITEMS_PER_DAY, DEFAULTS.maxItemsPerDay),
        maxConfirmations: parseNumber(env.MAX_CONFIRMATIONS, DEFAULTS.maxConfirmations),
        maxRegistrationsPerIp: parseNumber(env.MAX_REGISTRATIONS_PER_IP, DEFAULTS.maxRegistrationsPerIp),
    };
}

export function isOriginAllowed(origin: string | null, allowed: string[]): boolean {
    if (allowed.length === 0) return true;
    if (!origin) return false;
    return allowed.some(entry => {
        if (entry === '*') return true;
        if (entry.startsWith('*.')) {
            const suffix = entry.slice(1);
            try {
                return new URL(origin).hostname.endsWith(suffix);
            } catch {
                return false;
            }
        }
        return entry === origin;
    });
}
