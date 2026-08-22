import { useCallback, useEffect, useRef, useState } from "react";
import { characterStorage } from "@modules/core/storage";
import type { HerbBagsState } from "@client/types/herbs";
import { normalizeHerbBagsState } from "@client/types/herbs";
import loadHerbs, { type HerbsData } from "@client/scripts/lib/herbsLoader";
import { buildHerbTextBuffer } from "@client/scripts/lib/herbTextBuilder";
import { openHerbContextMenu } from "@modules/core/contextMenus";
import eventBus from "@modules/core/eventBus";
import { DockablePopupWrapper } from "../layout/components/DockablePopupWrapper";
import { usePopup } from "../hooks/usePopup";

const POPUP_ID = 'popup:herb-text';

type HerbCounts = HerbBagsState | undefined;

const getInitialCounts = (): HerbCounts => {
    const stored = characterStorage.get("herb_counts");
    if (!stored) {
        return undefined;
    }
    return normalizeHerbBagsState(stored);
};

const HerbTextWindow = () => {
    const [bags, setBags] = useState<HerbBagsState>(() => getInitialCounts() ?? {});
    const herbsDataRef = useRef<HerbsData | null>(null);
    const herbsDataPromiseRef = useRef<Promise<HerbsData | null> | null>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    const { wrapperProps, isOpen, setIsOpen } = usePopup(POPUP_ID);

    // Refs to access current values in ref callback without dependencies
    const bagsRef = useRef(bags);
    bagsRef.current = bags;
    const isOpenRef = useRef(isOpen);
    isOpenRef.current = isOpen;

    const ensureHerbsData = useCallback(async (): Promise<HerbsData | null> => {
        if (herbsDataRef.current) {
            return herbsDataRef.current;
        }
        if (!herbsDataPromiseRef.current) {
            herbsDataPromiseRef.current = loadHerbs()
                .then(data => {
                    herbsDataRef.current = data;
                    return data;
                })
                .finally(() => {
                    herbsDataPromiseRef.current = null;
                });
        }
        return herbsDataPromiseRef.current;
    }, []);

    // Context menu handler for herb names
    const handleHerbContextMenu = useCallback((herbId: string, ev: MouseEvent) => {
        if (!herbsDataRef.current) return;

        const actions = herbsDataRef.current.herb_id_to_use[herbId];
        openHerbContextMenu({
            herbId,
            actions,
            x: ev.clientX,
            y: ev.clientY,
            commandPrefix: '/zi',
        });
    }, []);

    // Update content using toDom() for proper event handler support
    const updateContent = useCallback(async (currentBags: HerbBagsState) => {
        const herbsData = await ensureHerbsData();
        const buffer = buildHerbTextBuffer(currentBags, herbsData, false, handleHerbContextMenu);
        const fragment = buffer.toDom();

        // Update the DOM directly - toDom() attaches event handlers
        if (contentRef.current) {
            contentRef.current.innerHTML = '';
            contentRef.current.appendChild(fragment);
        }
    }, [ensureHerbsData, handleHerbContextMenu]);

    // Ref callback to detect when DOM element changes (e.g., during dock/undock)
    // and repopulate content when it does
    const setContentRef = useCallback((node: HTMLDivElement | null) => {
        if (node === contentRef.current) return;
        contentRef.current = node;

        // If we have a new element and window is open, populate it
        if (node && isOpenRef.current) {
            requestAnimationFrame(() => {
                updateContent(bagsRef.current);
            });
        }
    }, [updateContent]);

    // Listen for herb counts updates
    useEffect(() => {
        const unsubscribe = eventBus.on("herbCounts", (detail) => {
            if (detail && typeof detail === "object") {
                const normalized = normalizeHerbBagsState(detail as HerbCounts);
                setBags(normalized);
            }
        });
        return () => unsubscribe();
    }, []);

    // Request herb counts when window opens
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        eventBus.emit('requestHerbCounts');
    }, [isOpen]);

    // Update content when bags change and window is open
    useEffect(() => {
        if (!isOpen) {
            return;
        }
        // Wait for next frame to ensure contentRef is mounted
        const rafId = requestAnimationFrame(() => {
            if (contentRef.current) {
                updateContent(bags);
            }
        });
        return () => cancelAnimationFrame(rafId);
    }, [isOpen, bags, updateContent]);

    // Listen for open event
    useEffect(() => {
        const unsubscribeOpen = eventBus.on("herbTextWindowOpen", () => {
            setIsOpen(true);
        });
        const unsubscribeClose = eventBus.on("herbTextWindowClose", () => {
            setIsOpen(false);
        });
        return () => {
            unsubscribeOpen();
            unsubscribeClose();
        };
    }, [setIsOpen]);

    const isEmpty = Object.keys(bags).length === 0 ||
        Object.values(bags).every(bag => Object.keys(bag?.herbs ?? {}).length === 0);

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="herb"
            title="Ziola"
            minWidth={300}
            minHeight={150}
            initialWidth={600}
            initialHeight={400}
            className="herb-text-window"
            bodyClassName="herb-text-window-body"
        >
            {isEmpty ? (
                <div className="herb-text-content herb-text-content--empty">
                    Brak danych o woreczkach. Uzyj aliasu <code>/ziola_buduj</code>, aby odswiezyc zawartosc.
                </div>
            ) : (
                <div
                    ref={setContentRef}
                    className="herb-text-content"
                />
            )}
        </DockablePopupWrapper>
    );
};

export default HerbTextWindow;
