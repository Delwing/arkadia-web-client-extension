// Device types
export type {
    DeviceInfo,
    DeviceSettings,
    DeviceSettingsExport,
    ImportedDeviceEntry,
    SyncGroup,
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
} from './deviceSettingsBundle';

// Sync group functions
export {
    clearSyncState,
    getSyncGroup,
    setSyncGroup,
    leaveSyncGroup,
    isInSyncGroup,
    createLocalSyncGroup,
} from './syncGroup';

// Device scope rules
export {
    DEVICE_SCOPED_CATEGORIES,
    shouldApplyDeviceSettings,
    isCategoryDeviceScoped,
} from './deviceScopeRules';
export type { DeviceScopeContext } from './deviceScopeRules';
