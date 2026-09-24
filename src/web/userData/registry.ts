/**
 * The synced data types and the tracker that watches them.
 * See docs/dev/SYNC_V2_PLAN.md, sections 4.1 and 7.
 */

import { getDeviceId } from '@modules/firebase/firebaseTypes';
import { getSyncGroup } from '@modules/device/syncGroup';
import { HybridLogicalClock } from '@modules/userData/hlc';
import { IndexedDbRecordStore, type RecordStore } from '@modules/userData/recordStore';
import { UserDataTracker } from '@modules/userData/tracker';
import type { UserDataType } from '@modules/userData/types';
import {
    characterKeysType,
    characterValueType,
    improveCountsEnabledType,
    improveCountsType,
    interfaceTypes,
    keymapsType,
    listType,
    objectEntriesType,
    peopleEditsType,
    professionType,
} from './localStorageTypes';
import { createKnowledgeTypes } from './knowledgeTypes';
import { createMapCombatTypes } from './mapCombatTypes';
import { createPlayerDataTypes } from './playerDataTypes';

const HLC_STORAGE_KEY = 'arkadia.userData.hlc';

export function createUserDataTypes(deviceId: () => string = getDeviceId): UserDataType[] {
    return [
        listType('triggers', 'triggers'),
        listType('aliases', 'aliases'),
        listType('automationGroups', 'automationGroups'),
        listType('automationScripts', 'automationScripts'),
        objectEntriesType('shortcuts', 'shortcuts', true),
        keymapsType,
        objectEntriesType('shellSettings', 'shellSettings', false),
        objectEntriesType('renderSettings', 'renderSettings', false),
        objectEntriesType('mapSettings', 'mapSettings', false),
        objectEntriesType('behaviorSettings', 'behaviorSettings', false),
        characterKeysType,
        professionType,
        characterValueType('deposits', 'deposits'),
        characterValueType('containers', 'containers'),
        improveCountsType,
        improveCountsEnabledType,
        peopleEditsType,
        ...interfaceTypes(deviceId),
        ...createKnowledgeTypes(),
        ...createMapCombatTypes(),
        ...createPlayerDataTypes(),
    ];
}

export function createUserDataTracker(
    store: RecordStore = new IndexedDbRecordStore(),
    firstCaptureIsEdit?: (typeId: string) => boolean,
): UserDataTracker {
    const deviceId = getDeviceId();
    const clock = new HybridLogicalClock(deviceId, {
        load: () => localStorage.getItem(HLC_STORAGE_KEY),
        save: stamp => localStorage.setItem(HLC_STORAGE_KEY, stamp),
    });
    return new UserDataTracker({
        deviceId,
        types: createUserDataTypes(() => deviceId),
        store,
        clock,
        appliesFromDevice: other => !!getSyncGroup()?.devices.includes(other),
        firstCaptureIsEdit,
    });
}
