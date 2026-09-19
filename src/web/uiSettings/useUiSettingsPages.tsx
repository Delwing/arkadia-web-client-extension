import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";
import { getCustomSounds, saveCustomSounds, type CustomSound } from "@modules/core/customSounds";
import { loadLayoutState, resetLayoutState, saveLayoutState } from "@web/layout";
import type { SettingsCategoryKey } from "@web/settings/categories.ts";
import { apply, load, normalizeMapScale, save, type UiSettings as UiSettingsType } from "../uiSettingsCore";
import { getEmbeddedMap } from "../embedRegistry";
import { defaultUiSettings } from "../defaultUiSettings";
import AppearanceSection from "./sections/AppearanceSection";
import { LayoutManagerSection, OutputSection } from "./sections/WindowsSections";
import CommandsSection from "./sections/CommandsSection";
import FooterSections from "./sections/FooterSections";
import MapSections from "./sections/MapSections";
import NotificationsSection from "./sections/NotificationsSection";
import SoundSection from "./sections/SoundSection";
import LogsSection from "./sections/LogsSection";
import { MobileButtonsSection } from "./sections/OtherSections";
import OtherSection from "./sections/OtherSection";
import ManageSoundsModal from "./ManageSoundsModal";
import { SettingsCard } from "@web/settings/controls.tsx";
import DesktopButtons from "../options/DesktopButtons";
import MobileButtons from "../options/MobileButtons";
import MobileRadialCommands from "../options/MobileRadialCommands";

type UiCategoryKey = Extract<SettingsCategoryKey, `ui-${string}`>;

// Top-level keys whose value differs between two settings snapshots.
function changedKeys(a: UiSettingsType, b: UiSettingsType): string[] {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    const changed: string[] = [];
    for (const k of keys) {
        if (JSON.stringify((a as any)[k]) !== JSON.stringify((b as any)[k])) {
            changed.push(k);
        }
    }
    return changed;
}

function normalizeForSave(s: UiSettingsType): UiSettingsType {
    return {
        ...s,
        mapScale: normalizeMapScale(s.mapScale),
        outputMaxElements: Math.max(100, Math.floor(s.outputMaxElements) || defaultUiSettings.outputMaxElements),
        outputBottomPadding: Math.max(0, s.outputBottomPadding || 0),
        labelRenderMode: s.transparentLabels ? 'data' : s.labelRenderMode,
    };
}

export interface UiSettingsPagesProps {
    soundManager: { previewKey: (key: string) => void };
    onEnableNotifications: () => void;
}

export interface UiSettingsPages {
    pages: Record<UiCategoryKey, ReactNode>;
    /** Rendered once next to the pages (sub-dialogs). */
    extras: ReactNode;
    /** Dialog opened: start from what is stored. */
    reload: () => void;
    /** Dialog dismissed without saving: undo the live preview. */
    revert: () => void;
    save: () => void;
}

/**
 * The UI-settings half of the settings dialog: one draft shared by every
 * Interfejs page, previewed live and written on save.
 */
export function useUiSettingsPages({ soundManager, onEnableNotifications }: UiSettingsPagesProps): UiSettingsPages {
    const [draft, setDraft] = useState<UiSettingsType>(() => load());
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const savedRef = useRef(draft);

    const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
    const [layoutEnabled, setLayoutEnabled] = useState(() => loadLayoutState().enabled);
    const [layoutObjectList, setLayoutObjectList] = useState(() => loadLayoutState().enabledPanels.objectList);
    const [mapVersion, setMapVersion] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [explorationStats, setExplorationStats] = useState("");
    const [showManageSounds, setShowManageSounds] = useState(false);

    // The button editors keep their own drafts (separate storage entries);
    // remounting them is how a reopened dialog drops their unsaved edits.
    const [buttonsGeneration, setButtonsGeneration] = useState(0);
    const buttonSaves = useRef({ desktop: () => {}, mobile: () => {}, radial: () => {} });
    const registerButtonSave = useRef({
        desktop: (fn: () => void) => { buttonSaves.current.desktop = fn; },
        mobile: (fn: () => void) => { buttonSaves.current.mobile = fn; },
        radial: (fn: () => void) => { buttonSaves.current.radial = fn; },
    }).current;

    const update = useCallback((patch: Partial<UiSettingsType>) => setDraft(prev => ({ ...prev, ...patch })), []);

    // Live preview: re-apply whenever the draft changes.
    useEffect(() => {
        apply(draft);
    }, [draft]);

    const refreshExplorationStats = () => {
        const map = getEmbeddedMap();
        if (map?.getVisitedCount && map?.getRoomCount) {
            setExplorationStats(`(${map.getVisitedCount()}/${map.getRoomCount()})`);
        }
    };

    const updateMapVersion = async () => {
        try {
            const { getMapVersion } = await import("../mapDataLoader");
            const version = await getMapVersion();
            setMapVersion(version ? `v${version}` : "");
        } catch {
            // ignore
        }
    };

    const onRefreshMap = async () => {
        setRefreshing(true);
        try {
            // Refreshing the shared map data notifies subscribers (see main.ts),
            // which reload the live EmbeddedMap in place.
            const { forceRefreshMapData } = await import("../mapDataLoader");
            await forceRefreshMapData();
            await updateMapVersion();
        } catch (error) {
            console.error("Failed to refresh map data:", error);
        } finally {
            setRefreshing(false);
        }
    };

    const loadSounds = () => {
        getCustomSounds()
            .then(setCustomSounds)
            .catch(error => console.error("Failed to load custom sounds", error));
    };

    useEffect(() => {
        loadSounds();

        const offUiSettings = globalStorage.onChange("uiSettings", (newValue) => {
            if (newValue) {
                const fresh = load();
                // The map persists its current zoom to uiSettings.mapScale on every
                // wheel tick. Routing that write back through setDraft -> apply()
                // re-renders and recenters the map (refresh() + the map 'resize'
                // event), fighting the renderer's zoom-to-cursor and making the
                // wheel feel jittery. When mapScale is the only thing that changed,
                // sync our cached copy but skip the live re-apply.
                const prev = savedRef.current;
                savedRef.current = fresh;
                if (prev && changedKeys(prev, fresh).every((k) => k === "mapScale")) {
                    return;
                }
                setDraft(fresh);
            }
        });
        const offSounds = globalStorage.onChange("custom_sounds", () => loadSounds());

        return () => {
            offUiSettings?.();
            offSounds?.();
        };
    }, []);

    const reload = useCallback(() => {
        const fresh = load();
        savedRef.current = fresh;
        setDraft(fresh);
        const ls = loadLayoutState();
        setLayoutEnabled(ls.enabled);
        setLayoutObjectList(ls.enabledPanels.objectList);
        setButtonsGeneration(g => g + 1);
        refreshExplorationStats();
        void updateMapVersion();
    }, []);

    const revert = useCallback(() => {
        setDraft(savedRef.current);
    }, []);

    const saveDraft = useCallback(() => {
        const normalized = normalizeForSave(draftRef.current);
        save(normalized);
        savedRef.current = normalized;
        setDraft(normalized);
        buttonSaves.current.desktop();
        // Mobile buttons and the radial menu share a storage entry; each merges
        // its part into what is stored, so saving both keeps both.
        buttonSaves.current.mobile();
        buttonSaves.current.radial();
    }, []);

    const commitCustomDark = (color: string) => {
        const next: UiSettingsType = { ...draftRef.current, colorTheme: "custom-dark", customThemeColor: color };
        save(next);
        savedRef.current = next;
        setDraft(next);
    };

    const onLayoutEnabledChange = (v: boolean) => {
        const ls = loadLayoutState();
        ls.enabled = v;
        saveLayoutState(ls);
        setLayoutEnabled(v);
        eventBus.emit("layoutManagerStateChanged");
    };
    const onLayoutObjectListChange = (v: boolean) => {
        const ls = loadLayoutState();
        ls.enabledPanels.objectList = v;
        saveLayoutState(ls);
        setLayoutObjectList(v);
        eventBus.emit("layoutManagerStateChanged");
    };
    const onLayoutReset = () => {
        const ls = resetLayoutState();
        setLayoutEnabled(ls.enabled);
        setLayoutObjectList(ls.enabledPanels.objectList);
        eventBus.emit("layoutManagerStateChanged");
    };

    const onDeleteSound = (sound: CustomSound) => {
        const next = customSounds.filter(s => s.key !== sound.key);
        saveCustomSounds(next)
            .then(() => {
                setCustomSounds(next);
                if (draftRef.current.customBeepSoundKey === sound.key) {
                    update({ customBeepSoundKey: undefined });
                }
            })
            .catch(error => {
                console.error("Failed to delete custom sound", error);
                alert("Nie udało się usunąć dźwięku");
            });
    };

    const pages: Record<UiCategoryKey, ReactNode> = {
        "ui-appearance": <AppearanceSection draft={draft} update={update} commitCustomDark={commitCustomDark} />,
        "ui-windows": (
            <>
                <LayoutManagerSection
                    layoutEnabled={layoutEnabled} layoutObjectList={layoutObjectList}
                    onLayoutEnabledChange={onLayoutEnabledChange}
                    onLayoutObjectListChange={onLayoutObjectListChange}
                    onLayoutReset={onLayoutReset}
                />
                <OutputSection draft={draft} update={update} />
            </>
        ),
        "ui-commands": <CommandsSection draft={draft} update={update} />,
        "ui-buttons": (
            <SettingsCard title="Przyciski na ekranie" full>
                <DesktopButtons key={buttonsGeneration} registerSave={registerButtonSave.desktop} />
            </SettingsCard>
        ),
        "ui-mobile-buttons": (
            <>
                <MobileButtonsSection draft={draft} update={update} />
                <SettingsCard title="Układ przycisków" full>
                    <MobileButtons key={buttonsGeneration} registerSave={registerButtonSave.mobile} />
                </SettingsCard>
            </>
        ),
        "ui-radial": (
            <SettingsCard title="Konfiguracja" full>
                <MobileRadialCommands key={buttonsGeneration} registerSave={registerButtonSave.radial} />
            </SettingsCard>
        ),
        "ui-footer": <FooterSections draft={draft} update={update} />,
        "ui-map": (
            <MapSections
                draft={draft} update={update}
                mapVersion={mapVersion} refreshing={refreshing}
                onRefreshMap={onRefreshMap} explorationStats={explorationStats}
            />
        ),
        "ui-sound": (
            <>
                <NotificationsSection draft={draft} update={update} onEnableNotifications={onEnableNotifications} />
                <SoundSection
                    draft={draft} update={update}
                    customSounds={customSounds}
                    onCustomSoundsChange={setCustomSounds}
                    previewKey={(key) => soundManager.previewKey(key)}
                    onManage={() => setShowManageSounds(true)}
                />
            </>
        ),
        "ui-other": (
            <>
                <OtherSection draft={draft} update={update} />
                <LogsSection />
            </>
        ),
    };

    const extras = (
        <ManageSoundsModal
            show={showManageSounds}
            onHide={() => setShowManageSounds(false)}
            customSounds={customSounds}
            onDelete={onDeleteSound}
            previewKey={(key) => soundManager.previewKey(key)}
        />
    );

    return { pages, extras, reload, revert, save: saveDraft };
}
