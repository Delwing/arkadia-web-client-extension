import { useEffect, useRef, useState } from "react";
import eventBus from "@modules/core/eventBus";
import { globalStorage } from "@modules/core/storage";
import { getCustomSounds, saveCustomSounds, type CustomSound } from "@modules/core/customSounds";
import { loadLayoutState, resetLayoutState, saveLayoutState } from "@web/layout";
import { apply, load, normalizeMapScale, save, type UiSettings as UiSettingsType } from "../uiSettingsCore";
import { getEmbeddedMap } from "../embedRegistry";
import { defaultUiSettings } from "../defaultUiSettings";
import GeneralTab from "./tabs/GeneralTab";
import FooterTab from "./tabs/FooterTab";
import MapTab from "./tabs/MapTab";
import SoundTab from "./tabs/SoundTab";
import BehaviourTab from "./tabs/BehaviourTab";
import ManageSoundsModal from "./ManageSoundsModal";
import { OPEN_SETTINGS_EVENT, type OpenSettingsDetail } from "@web/assistant/openSettings.ts";

type Tab = "general" | "footer" | "map" | "sound";

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

const TABS: { key: Tab; label: string }[] = [
    { key: "general", label: "Ogólne" },
    { key: "footer", label: "Stopka" },
    { key: "map", label: "Mapa" },
    { key: "sound", label: "Dźwięk" },
];

interface UiSettingsProps {
    soundManager: { previewKey: (key: string) => void };
    onEnableNotifications: () => void;
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

function UiSettings({ soundManager, onEnableNotifications }: UiSettingsProps) {
    const [draft, setDraft] = useState<UiSettingsType>(() => load());
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const savedRef = useRef(draft);

    const [tab, setTab] = useState<Tab>("general");
    const [customSounds, setCustomSounds] = useState<CustomSound[]>([]);
    const [layoutEnabled, setLayoutEnabled] = useState(() => loadLayoutState().enabled);
    const [layoutObjectList, setLayoutObjectList] = useState(() => loadLayoutState().enabledPanels.objectList);
    const [mapVersion, setMapVersion] = useState("");
    const [refreshing, setRefreshing] = useState(false);
    const [explorationStats, setExplorationStats] = useState("");
    const [showManageSounds, setShowManageSounds] = useState(false);

    const scrollRefs: Record<Tab, React.RefObject<HTMLDivElement | null>> = {
        general: useRef<HTMLDivElement>(null),
        footer: useRef<HTMLDivElement>(null),
        map: useRef<HTMLDivElement>(null),
        sound: useRef<HTMLDivElement>(null),
    };
    const scrollPos = useRef<Record<Tab, number>>({ general: 0, footer: 0, map: 0, sound: 0 });

    const update = (patch: Partial<UiSettingsType>) => setDraft(prev => ({ ...prev, ...patch }));

    // Live preview: re-apply whenever the draft changes.
    useEffect(() => {
        apply(draft);
    }, [draft]);

    const changeTab = (next: Tab) => {
        const current = scrollRefs[tab].current;
        if (current) scrollPos.current[tab] = current.scrollTop;
        setTab(next);
    };

    useEffect(() => {
        const el = scrollRefs[tab].current;
        if (el) el.scrollTop = scrollPos.current[tab];
        // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollRefs/scrollPos are refs
    }, [tab]);

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

    // Mount: subscribe to storage + modal lifecycle + save event.
    useEffect(() => {
        loadSounds();

        const onSave = () => {
            const normalized = normalizeForSave(draftRef.current);
            save(normalized);
            savedRef.current = normalized;
            setDraft(normalized);
            (document.activeElement as HTMLElement)?.blur?.();
            window.dispatchEvent(new Event("close-ui-settings"));
        };
        window.addEventListener("save-ui-settings", onSave);

        /**
         * The assistant sending the user here for a setting it may not change
         * itself. It knows the tab only by its label ("Stopka"), because the ids
         * below are private to this component — so the mapping lives here, where
         * renaming a tab and updating the mapping are the same edit.
         *
         * An unrecognised label leaves the dialog on whatever tab it had; the
         * card still shows the full path, so the user can finish by hand.
         */
        const onAssistantOpen = (event: Event) => {
            const detail = (event as CustomEvent<OpenSettingsDetail>).detail;
            if (detail?.surface !== "ui" || !detail.tabLabel) return;
            const wanted = TABS.find(entry => entry.label === detail.tabLabel);
            if (wanted) setTab(wanted.key);
        };
        window.addEventListener(OPEN_SETTINGS_EVENT, onAssistantOpen);

        const modalEl = document.getElementById("ui-settings-modal");
        const onShow = () => {
            const fresh = load();
            savedRef.current = fresh;
            setDraft(fresh);
            const ls = loadLayoutState();
            setLayoutEnabled(ls.enabled);
            setLayoutObjectList(ls.enabledPanels.objectList);
            refreshExplorationStats();
            void updateMapVersion();
        };
        // Restore live-previewed settings when dismissed without saving.
        const onHidden = () => {
            setDraft(savedRef.current);
        };
        modalEl?.addEventListener("show.bs.modal", onShow);
        modalEl?.addEventListener("hidden.bs.modal", onHidden);

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
            window.removeEventListener("save-ui-settings", onSave);
            window.removeEventListener(OPEN_SETTINGS_EVENT, onAssistantOpen);
            modalEl?.removeEventListener("show.bs.modal", onShow);
            modalEl?.removeEventListener("hidden.bs.modal", onHidden);
            offUiSettings?.();
            offSounds?.();
        };
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

    const renderTab = (key: Tab) => {
        switch (key) {
        case "general":
            return (
                <>
                    <GeneralTab
                        draft={draft} update={update} commitCustomDark={commitCustomDark}
                        layoutEnabled={layoutEnabled} layoutObjectList={layoutObjectList}
                        onLayoutEnabledChange={onLayoutEnabledChange}
                        onLayoutObjectListChange={onLayoutObjectListChange}
                        onLayoutReset={onLayoutReset}
                    />
                    <BehaviourTab draft={draft} update={update} onEnableNotifications={onEnableNotifications} />
                </>
            );
        case "footer":
            return <FooterTab draft={draft} update={update} />;
        case "map":
            return (
                <MapTab
                    draft={draft} update={update}
                    mapVersion={mapVersion} refreshing={refreshing}
                    onRefreshMap={onRefreshMap} explorationStats={explorationStats}
                />
            );
        case "sound":
            return (
                <SoundTab
                    draft={draft} update={update}
                    customSounds={customSounds}
                    onCustomSoundsChange={setCustomSounds}
                    previewKey={(key) => soundManager.previewKey(key)}
                    onManage={() => setShowManageSounds(true)}
                />
            );
        }
    };

    return (
        <div className="p-2 d-flex flex-column h-100" style={{ minHeight: 0 }}>
            <div className="mb-3 pb-2 flex-shrink-0">
                <div className="d-flex gap-2 flex-wrap">
                    {TABS.map(t => (
                        <button
                            key={t.key}
                            className={`btn btn-sm ${tab === t.key ? "btn-primary" : "btn-secondary"}`}
                            onClick={() => changeTab(t.key)}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="flex-grow-1 overflow-hidden" style={{ minHeight: 0 }}>
                {TABS.map(t => (
                    <div
                        key={t.key}
                        ref={scrollRefs[t.key]}
                        className={`h-100 overflow-auto${tab === t.key ? "" : " d-none"}`}
                        style={{ minHeight: 0 }}
                    >
                        <div className={t.key === "sound" ? "ui-settings-stack" : "ui-settings-layout"}>
                            {renderTab(t.key)}
                        </div>
                    </div>
                ))}
            </div>
            <ManageSoundsModal
                show={showManageSounds}
                onHide={() => setShowManageSounds(false)}
                customSounds={customSounds}
                onDelete={onDeleteSound}
                previewKey={(key) => soundManager.previewKey(key)}
            />
        </div>
    );
}

export default UiSettings;
