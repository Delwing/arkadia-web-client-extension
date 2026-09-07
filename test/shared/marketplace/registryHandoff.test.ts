import { describe, expect, it } from 'vitest';
import {
    EDITOR_PLACEHOLDER_DESCRIPTION,
    HANDOFF_PUBLISHED,
    HANDOFF_READY,
    handoffMetadata,
    handoffUrl,
    readRegistryMessage,
} from '@shared/marketplace/registryHandoff.ts';

const REGISTRY = 'https://registry.example';

describe('handoffUrl', () => {
    it('declares who is handing the package over', () => {
        expect(handoffUrl(REGISTRY, 'https://delwing.github.io')).toBe(
            'https://registry.example/z-edytora?origin=https%3A%2F%2Fdelwing.github.io',
        );
    });
});

describe('readRegistryMessage', () => {
    it('accepts the ready handshake from the registry', () => {
        expect(readRegistryMessage({ origin: REGISTRY, data: { type: HANDOFF_READY } }, REGISTRY)).toEqual({
            type: HANDOFF_READY,
        });
    });

    it('accepts a complete published report', () => {
        const data = { type: HANDOFF_PUBLISHED, slug: 'combat-alert', version: '1.2.0', url: 'https://x/y.js' };
        expect(readRegistryMessage({ origin: REGISTRY, data }, REGISTRY)).toEqual(data);
    });

    it('ignores messages from anywhere but the registry', () => {
        const data = { type: HANDOFF_READY };
        expect(readRegistryMessage({ origin: 'https://evil.example', data }, REGISTRY)).toBeNull();
    });

    it('ignores unrelated traffic on the same channel', () => {
        for (const data of [null, undefined, 'hi', 7, {}, { type: 'webpackHotUpdate' }]) {
            expect(readRegistryMessage({ origin: REGISTRY, data }, REGISTRY)).toBeNull();
        }
    });

    it('rejects a published report missing its fields', () => {
        const data = { type: HANDOFF_PUBLISHED, slug: 'x' };
        expect(readRegistryMessage({ origin: REGISTRY, data }, REGISTRY)).toBeNull();
    });
});

describe('handoffMetadata', () => {
    it('drops the placeholders savePlugin stamps on every plugin', () => {
        // savePlugin always writes version 1.0.0 and this description, so both
        // say nothing about the plugin and must not override what the code says.
        const meta = handoffMetadata({
            name: 'Combat Alert',
            metadata: {
                name: 'Combat Alert',
                version: '1.0.0',
                description: EDITOR_PLACEHOLDER_DESCRIPTION,
            },
        });

        expect(meta).toEqual({
            name: 'Combat Alert',
            version: undefined,
            description: undefined,
            slug: undefined,
        });
    });

    it('keeps metadata the author actually set', () => {
        const meta = handoffMetadata({
            name: 'ignored',
            metadata: { name: 'Combat Alert', version: '2.3.0', description: 'Sledzi walke.' },
            registrySlug: 'combat-alert',
        });

        expect(meta).toEqual({
            name: 'Combat Alert',
            version: '2.3.0',
            description: 'Sledzi walke.',
            slug: 'combat-alert',
        });
    });

    it('falls back to the plugin name when there is no metadata at all', () => {
        expect(handoffMetadata({ name: 'Bez metadanych' }).name).toBe('Bez metadanych');
    });
});
