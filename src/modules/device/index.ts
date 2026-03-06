// Device types
export type {
    DeviceInfo,
    DeviceSettings,
    DeviceRegistryEntry,
    DeviceSettingsExport,
    ImportedDeviceEntry,
    SyncGroup,
    SyncedDeviceSettings,
    SyncConflict,
    SyncState,
} from './deviceTypes';

export {
    DEVICE_STORAGE_KEYS,
    getDeviceDisplayName,
} from './deviceTypes';

// Device storage
export {
    detectBrowser,
    detectOS,
    generateDeviceName,
    getOrCreateDeviceInfo,
    getDeviceInfo,
    setDeviceCustomName,
    updateDeviceSyncTime,
    getDeviceDisplayName as getCurrentDeviceDisplayName,
    getImportedDevices,
    saveImportedDevice,
    deleteImportedDevice,
    applyImportedDeviceSettings,
    triggerSettingsReload,
} from './deviceStorage';

// Device settings bundle
export {
    exportDeviceSettings,
    importDeviceSettings,
    createDeviceSettingsExport,
    validateDeviceSettingsExport,
    importDeviceSettingsExport,
    getDeviceSettingsChecksum,
    exportPartialDeviceSettings,
} from './deviceSettingsBundle';

// Sync group functions
export {
    getSyncState,
    setSyncState,
    clearSyncState,
    getSyncGroup,
    setSyncGroup,
    leaveSyncGroup,
    isInSyncGroup,
    getSyncVersion,
    setSyncVersion,
    incrementSyncVersion,
    getRawDeviceSettings,
    calculateSettingsChecksum,
    buildSyncedDeviceSettings,
    applySyncedSettings,
    createLocalSyncGroup,
} from './syncGroup';

// Device scope rules
export {
    DEVICE_SCOPED_STORAGE_KEYS,
    DEVICE_SCOPED_CATEGORIES,
    shouldApplyDeviceSettings,
    isCategoryDeviceScoped,
} from './deviceScopeRules';
export type { DeviceScopeContext } from './deviceScopeRules';
