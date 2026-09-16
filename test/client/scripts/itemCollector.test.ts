import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import ItemCollector from '@client/scripts/itemCollector';
import { defaultSettings } from '@modules/core/defaultSettings';
import { characterStorage } from '@modules/core/storage';

class FakeClient {
    private emitter = new EventEmitter();
    sendCommand = vi.fn();
    print = vi.fn();
    bind: { label: string; callback: () => void } | null = null;
    FunctionalBind = {
        setCategory: vi.fn((_category: string, label: string, callback: () => void) => {
            this.bind = { label, callback };
        }),
        clearCategory: vi.fn(() => {
            this.bind = null;
        }),
    };
    TeamManager = { isInAnyTeam: () => false, isLeader: () => false };
    on(event: string, cb: (...args: any[]) => void) { this.emitter.on(event, cb); }
    emit(event: string, detail?: unknown) { this.emitter.emit(event, detail); }
}

describe('ItemCollector', () => {
    let client: FakeClient;

    const kill = (enemyDesc: string, hasBody: boolean) =>
        client.emit('enemyKilled', { objNum: 1, killer: 'ME', hasBody, enemyDesc });

    const pressBind = () => client.bind!.callback();

    beforeEach(() => {
        localStorage.clear();
        characterStorage.setCharacter('TestChar');
        characterStorage.set('settings', { ...defaultSettings, collectTiming: 1 });
        client = new FakeClient();
        new ItemCollector(client as any);
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('picks coins and gems up off the floor after a bodiless elemental', () => {
        kill('wielki ognisty zywiolak ognia', false);
        client.emit('allEnemiesKilled');

        expect(client.bind?.label).toBe('wez z ziemi');
        pressBind();

        expect(client.sendCommand.mock.calls.map(c => c[0])).toEqual([
            'wez srebrne monety',
            'wez zlote monety',
            'wez kamienie',
            'ocen kamienie',
            'otworz swoj plecak',
            'wloz monety do swojego plecaka',
            'wloz kamienie do swojego plecaka',
            'zamknij swoj plecak',
        ]);
    });

    it('sweeps the floor once for several bodiless kills', () => {
        kill('wielki ognisty zywiolak ognia', false);
        kill('potezny kamienny zywiolak ziemi', false);
        client.emit('allEnemiesKilled');
        pressBind();

        const commands = client.sendCommand.mock.calls.map(c => c[0]);
        expect(commands.filter(c => c === 'wez srebrne monety')).toHaveLength(1);
        expect(commands.filter(c => c === 'wez kamienie')).toHaveLength(1);
    });

    it('does not search the floor after a bodiless enemy without an override', () => {
        kill('blady przezroczysty duch', false);
        client.emit('allEnemiesKilled');

        expect(client.bind).toBeNull();
        expect(client.sendCommand).not.toHaveBeenCalled();
    });

    it('collects bodies by index and the floor after them', () => {
        kill('ogromny szary troll', true);
        kill('wielki ognisty zywiolak ognia', false);
        client.emit('allEnemiesKilled');

        expect(client.bind?.label).toBe('wez z ciala');
        pressBind();

        expect(client.sendCommand.mock.calls.map(c => c[0])).toEqual([
            'wez srebrne monety z 1. ciala',
            'wez zlote monety z 1. ciala',
            'wez kamienie z 1. ciala',
            'wez srebrne monety',
            'wez zlote monety',
            'wez kamienie',
            'ocen kamienie',
            'otworz swoj plecak',
            'wloz monety do swojego plecaka',
            'wloz kamienie do swojego plecaka',
            'zamknij swoj plecak',
        ]);
    });

    it('offers the floor right after a bodiless kill in after-each-kill timing', () => {
        characterStorage.set('settings', { ...defaultSettings, collectTiming: 2 });

        kill('wielki ognisty zywiolak ognia', false);

        expect(client.bind?.label).toBe('wez z ziemi');
        pressBind();
        expect(client.sendCommand).toHaveBeenCalledWith('wez srebrne monety');
        expect(client.bind).toBeNull();
    });
});
