import Client from "../Client";
import { createAttackController } from "../utils/attackController";
import { subscribe as subscribeToPeopleStore, refresh as refreshPeopleStore } from '@modules/data/peopleStore';
import type { PersonEntry } from '../types/people';
import { colorString, createColorFormat } from '@modules/core/Colors';
import { AnsiAwareBuffer } from '@client/ansi/FormatState';
import storage from '@modules/core/storage';
import { defaultBinds, resolveActiveBinds } from '@shared/binds';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const ALT_LABEL = isMac ? '⌥' : 'ALT';

const NUM_SLOTS = 3;
const ORANGE = createColorFormat('#ff8800');
const RED = createColorFormat('#ff0000');
const WHITE = createColorFormat('#ffffff');

interface Bind {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
}

export default function initEnemyBinds(
    client: Client,
    aliases?: { pattern: RegExp; callback: Function }[]
) {
    const list = aliases ?? client.aliases;
    const attackController = createAttackController(client);

    let bindSlots: (number | null)[] = [null, null, null];
    let enabled = true;
    let enemyGuilds: string[] = [];
    let peopleCache: PersonEntry[] = [];
    let keepUnchanged = false;
    let showMode: 'always' | 'whenBound' | 'never' = 'always';
    let enabledSlots: [boolean, boolean, boolean] = [true, true, true];
    let enemyBindKeys: Bind[] = [...defaultBinds.enemy];
    let enemyBlockBindKeys: Bind[] = [...defaultBinds.enemyBlock];

    subscribeToPeopleStore(snapshot => {
        peopleCache = snapshot ?? [];
    });

    function ensurePeopleLoaded() {
        return refreshPeopleStore().catch(error => {
            console.warn('Failed to load people database', error);
            return undefined;
        });
    }

    ensurePeopleLoaded().catch(() => undefined);

    // Load enemy binds keys from storage
    Promise.all([storage.getItem('binds'), storage.getItem('bindsKeymapId')]).then(([bindsRes, keymapRes]) => {
        const activeKeymapId = typeof keymapRes?.bindsKeymapId === 'string' ? keymapRes.bindsKeymapId : null;
        const resolved = resolveActiveBinds(bindsRes?.binds, activeKeymapId, defaultBinds);
        if (Array.isArray(resolved.enemy) && resolved.enemy.length === 3) {
            enemyBindKeys = resolved.enemy.map((bind: any) => ({
                key: bind.key || 'F1',
                ctrl: bind.ctrl,
                alt: bind.alt,
                shift: bind.shift,
            }));
        }
        if (Array.isArray(resolved.enemyBlock) && resolved.enemyBlock.length === 3) {
            enemyBlockBindKeys = resolved.enemyBlock.map((bind: any) => ({
                key: bind.key || 'F1',
                ctrl: bind.ctrl,
                alt: bind.alt,
                shift: bind.shift,
            }));
        }
    }).catch(() => {
        // Use defaults on error
    });

    client.on('settings', (settings) => {
        const detail = (settings ?? {}) as {
            enemyGuilds?: unknown;
            enemyBindsKeepUnchanged?: boolean;
            enemyBindsShowMode?: 'always' | 'whenBound' | 'never';
            enemyBindsEnabledSlots?: unknown;
        };
        if (Array.isArray(detail.enemyGuilds)) {
            enemyGuilds = detail.enemyGuilds.filter(g => typeof g === 'string') as string[];
        }
        keepUnchanged = detail.enemyBindsKeepUnchanged ?? false;
        showMode = detail.enemyBindsShowMode ?? 'always';
        if (Array.isArray(detail.enemyBindsEnabledSlots) && detail.enemyBindsEnabledSlots.length === 3) {
            enabledSlots = detail.enemyBindsEnabledSlots as [boolean, boolean, boolean];
        }
    });

    function isEnemy(desc: string): boolean {
        if (enemyGuilds.length === 0) {
            return false;
        }

        const person = peopleCache.find(p =>
            p.description.toLowerCase() === desc.toLowerCase() ||
            p.name.toLowerCase() === desc.toLowerCase()
        );

        return !!person && enemyGuilds.includes(person.guild);
    }

    function formatBindLabel(bind: Bind): string {
        let key = bind.key;
        if (key.startsWith('Digit')) key = key.substring(5);
        else if (key.startsWith('Key')) key = key.substring(3);
        else if (key === 'BracketRight') key = ']';
        else if (key === 'BracketLeft') key = '[';
        else if (key === 'Backquote') key = '`';
        const parts: string[] = [];
        if (bind.ctrl) parts.push('CTRL');
        if (bind.alt) parts.push(ALT_LABEL);
        if (bind.shift) parts.push('SHIFT');
        parts.push(key);
        return parts.join('+');
    }

    function displayBindings() {
        const objects = client.ObjectManager.getObjectsOnLocation();
        const hasAnyBindings = bindSlots.some((slot, i) => slot !== null && enabledSlots[i]);

        if (!hasAnyBindings) {
            return;
        }

        client.print('\n');

        for (let i = 0; i < NUM_SLOTS; i++) {
            const objectId = bindSlots[i];
            const keyBind = enemyBindKeys[i];
            const blockKeyBind = enemyBlockBindKeys[i];

            if (objectId !== null && enabledSlots[i]) {
                const obj = objects.find(o => o.num === objectId);
                const desc = obj?.desc ?? `ob_${objectId}`;

                const line = new AnsiAwareBuffer();

                // First part: [F1] ATK: desc >> (clickable to attack)
                const attackText = `[${formatBindLabel(keyBind)}] ATK: ${desc}`;
                line.appendBuffer(colorString(attackText, RED));
                const attackEnd = line.length;
                line.createLink([0, attackEnd], {
                    onClick: () => attackController.attackById(objectId),
                    title: `Kliknij aby zaatakować ${desc}`
                });

                line.append(" >> ", WHITE)

                // Second part: [block key] zablokuj (clickable to block)
                const blockKeyLabel = formatBindLabel(blockKeyBind);
                const blockText = `[${blockKeyLabel}] zablokuj\n`;
                const blockStart = line.length;
                line.appendBuffer(colorString(blockText, ORANGE));
                const blockEnd = line.length;
                line.createLink([blockStart, blockEnd], {
                    onClick: () => client.sendCommand(`zablokuj ob_${objectId}`),
                    title: `Kliknij aby zablokować ${desc}`
                });

                client.print(line);
            }
        }

        client.print('\n');
    }

    client.on('gmcp.objects.data', (data: any) => {
        if (!enabled || !data || typeof data !== 'object') {
            return;
        }

        // Check if any object has desc that matches enemy
        const enemies: { num: number; desc: string }[] = [];
        Object.keys(data).forEach(numStr => {
            const num = parseInt(numStr);
            const obj = data[numStr];
            if (obj.desc && isEnemy(obj.desc)) {
                enemies.push({ num, desc: obj.desc });
            }
        });

        // If no enemies with desc, nothing to do
        if (enemies.length === 0) {
            return;
        }

        const hadEnemies = bindSlots.some(slot => slot !== null);
        const newBindSlots: (number | null)[] = [null, null, null];

        if (keepUnchanged) {
            // Persistence mode: keep existing bindings if they still exist
            const alreadyBound = new Set<number>();

            // First, preserve existing bindings that are still valid
            for (let i = 0; i < NUM_SLOTS; i++) {
                const currentId = bindSlots[i];
                if (currentId !== null && enabledSlots[i]) {
                    if (enemies.some(e => e.num === currentId)) {
                        newBindSlots[i] = currentId;
                        alreadyBound.add(currentId);
                    }
                }
            }

            // Then, fill empty slots with new enemies (only for enabled slots)
            let enemyIndex = 0;
            for (let i = 0; i < NUM_SLOTS; i++) {
                if (newBindSlots[i] === null && enabledSlots[i]) {
                    // Find next unbound enemy
                    while (enemyIndex < enemies.length && alreadyBound.has(enemies[enemyIndex].num)) {
                        enemyIndex++;
                    }
                    if (enemyIndex < enemies.length) {
                        newBindSlots[i] = enemies[enemyIndex].num;
                        alreadyBound.add(enemies[enemyIndex].num);
                        enemyIndex++;
                    }
                }
            }
        } else {
            // Standard mode: rebind all slots (only for enabled slots)
            let enemyIndex = 0;
            for (let i = 0; i < NUM_SLOTS; i++) {
                if (enabledSlots[i] && enemyIndex < enemies.length) {
                    newBindSlots[i] = enemies[enemyIndex].num;
                    enemyIndex++;
                }
            }
        }

        bindSlots = newBindSlots;

        // Display bindings based on show mode - only when assigned in this iteration
        const hasEnemies = bindSlots.some((slot, i) => slot !== null && enabledSlots[i]);

        // Check if bindings changed
        const bindingsChanged = !hadEnemies && hasEnemies;

        const shouldShow =
            (showMode === 'always' && hasEnemies) || // Show when enemies are assigned
            (showMode === 'whenBound' && bindingsChanged); // Show only when transitioning from no enemies to enemies

        if (shouldShow) {
            displayBindings();
        }
    });

    // Set up keyboard event listeners for enemy binds
    window.addEventListener('keydown', (ev) => {
        for (let index = 0; index < NUM_SLOTS; index++) {
            const bind = enemyBindKeys[index];
            const matchesKey = ev.code === bind.key || ev.key === bind.key;
            const matchesModifiers =
                (bind.ctrl ?? false) === ev.ctrlKey &&
                (bind.alt ?? false) === ev.altKey &&
                (bind.shift ?? false) === ev.shiftKey;

            if (matchesKey && matchesModifiers) {
                const objectId = bindSlots[index];
                if (objectId !== null && enabled && enabledSlots[index]) {
                    attackController.attackById(objectId);
                    ev.preventDefault();
                    return;
                }
            }
        }
    });

    // Enemy block binds for zablokuj
    window.addEventListener('keydown', (ev) => {
        for (let index = 0; index < NUM_SLOTS; index++) {
            const bind = enemyBlockBindKeys[index];
            const matchesKey = ev.code === bind.key || ev.key === bind.key;
            const matchesModifiers =
                (bind.ctrl ?? false) === ev.ctrlKey &&
                (bind.alt ?? false) === ev.altKey &&
                (bind.shift ?? false) === ev.shiftKey;

            if (matchesKey && matchesModifiers) {
                const objectId = bindSlots[index];
                if (objectId !== null && enabled && enabledSlots[index]) {
                    client.sendCommand(`zablokuj ob_${objectId}`);
                    ev.preventDefault();
                    return;
                }
            }
        }
    });

    list.push({
        pattern: /^\/nabindach$/,
        callback: () => {
            if (!enabled) {
                client.println('Enemy binds are disabled. Use /enemy- to clear and re-enable.');
                return;
            }

            displayBindings();
        },
    });

    list.push({
        pattern: /^\/nabindach--$/,
        callback: () => {
            bindSlots = [null, null, null];
            enabled = false;
            client.println('Enemy binds cleared and disabled. Binds will re-enable on next room change.');
        },
    });

    client.on('gmcp.room.info', () => {
        if (!enabled) {
            enabled = true;
        }
    });

    // Expose methods for mobile buttons and other integrations
    client.attackEnemySlot = (slotIndex: number) => {
        if (slotIndex < 0 || slotIndex >= NUM_SLOTS) {
            return;
        }
        const objectId = bindSlots[slotIndex];
        if (objectId !== null && enabled && enabledSlots[slotIndex]) {
            attackController.attackById(objectId);
        }
    };

    client.blockEnemySlot = (slotIndex: number) => {
        if (slotIndex < 0 || slotIndex >= NUM_SLOTS) {
            return;
        }
        const objectId = bindSlots[slotIndex];
        if (objectId !== null && enabled && enabledSlots[slotIndex]) {
            client.sendCommand(`zablokuj ob_${objectId}`);
        }
    };
}
