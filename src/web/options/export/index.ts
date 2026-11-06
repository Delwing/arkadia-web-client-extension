/**
 * Backup files and per-category export/import for sync. Each file in this
 * folder has one job:
 *
 * - `characterKeys`  — which localStorage keys are character-scoped / never exported
 * - `storageKeys`    — generic export/import of registry-declared storage keys
 * - `storageChanges` — tracked localStorage writes and the listener notification after an import
 * - `categories/*`   — one handler per hand-written (`customSync`) category
 * - `categories`     — export/import of any registry category
 * - `mergeEnvelopes` — merging per-character envelopes in sync conflicts
 * - `backup`         — the current (v2) backup file
 * - `legacyBackup`   — restoring the legacy (v1) backup file
 * - `importValidator`— recognising backup files
 */
export { collectCharacters, isExcludedLocalStorageKey, parseCharacterStorageKey } from './characterKeys';
export { exportCategories, exportCategory, importCategories, importCategory } from './categories';
export { mergeCloudProfessionData } from './categories/characterSettings';
export { mergePerCharacterEnvelopes } from './mergeEnvelopes';
export { buildBackup, restoreBackup, type BackupPayload, type ImportResult } from './backup';
export { type ExportPayload } from './legacyBackup';
export { isRestorableBackup } from './importValidator';
