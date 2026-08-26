import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { characterStorage } from "@modules/core/storage";
import type { HerbBagState, HerbBagsState, HerbMoveOptions } from "@client/types/herbs";
import { normalizeHerbBagsState } from "@client/types/herbs";
import { openHerbContextMenu } from "@modules/core/contextMenus";
import loadHerbs, { type HerbsData } from "@client/scripts/herbsLoader";
import eventBus from "@modules/core/eventBus";
import { hideContextMenu } from "@web/contextMenu";
import { getHerbManager } from "@modules/core/herbManagerProvider";
import { DockablePopupWrapper } from "../layout/components/DockablePopupWrapper";
import { useLayoutManagerOptional } from "../layout/hooks/useLayoutManager";
import { usePopup } from "../hooks/usePopup";
import { usePopupSetting } from "../hooks/usePopupSetting";

const POPUP_ID = 'popup:herb';

type HerbCounts = HerbBagsState | undefined;

interface HerbStack {
    instanceId: string;
    herbId: string;
    count: number;
    isSplit?: boolean;
}

interface HerbBag {
    bagNumber: number;
    items: HerbStack[];
    condition?: number;
}

interface DragPayload {
    bagNumber: number;
    stackId: string;
}

type HerbPillStyle = React.CSSProperties & {
    ["--herb-pill-bg"]?: string;
    ["--herb-pill-bg-hover"]?: string;
    ["--herb-pill-border"]?: string;
    ["--herb-pill-border-hover"]?: string;
    ["--herb-pill-bg-split"]?: string;
    ["--herb-pill-border-split"]?: string;
    ["--herb-pill-text"]?: string;
};

const herbStyleCache = new Map<string, HerbPillStyle>();

const stripMudletColors = (text: string): string => text.replace(/<[a-zA-Z_]+>/g, '');

const getConditionVariant = (value: number): "good" | "warn" | "bad" => {
    if (value >= 4) {
        return "good";
    }
    if (value === 3) {
        return "warn";
    }
    return "bad";
};

const buildBags = (source: HerbCounts, allocateId: () => string): HerbBag[] => {
    if (!source) {
        return [];
    }
    const entries = Object.entries(source);
    return entries
        .map(([key, contents]) => {
            const bagNumber = Number(key);
            if (!Number.isFinite(bagNumber)) {
                return null;
            }
            const bagState = contents as HerbBagState | undefined;
            const herbs = bagState?.herbs ?? {};
            const items: HerbStack[] = Object.entries(herbs)
                .filter(([, count]) => typeof count === "number" && count > 0)
                .map(([herbId, count]) => ({
                    herbId,
                    count,
                    instanceId: allocateId(),
                }))
                .sort((a, b) => a.herbId.localeCompare(b.herbId));
            const condition = typeof bagState?.condition === "number" ? bagState.condition : undefined;
            return { bagNumber, items, condition } as HerbBag;
        })
        .filter((bag): bag is HerbBag => !!bag)
        .sort((a, b) => a.bagNumber - b.bagNumber);
};

const sortItems = (items: HerbStack[]): HerbStack[] => {
    const next = items.slice();
    next.sort((a, b) => {
        const byHerb = a.herbId.localeCompare(b.herbId);
        if (byHerb !== 0) {
            return byHerb;
        }
        return a.instanceId.localeCompare(b.instanceId);
    });
    return next;
};

const ensureBag = (bags: HerbBag[], bagNumber: number): HerbBag => {
    let bag = bags.find(b => b.bagNumber === bagNumber);
    if (!bag) {
        bag = { bagNumber, items: [] };
        bags.push(bag);
        bags.sort((a, b) => a.bagNumber - b.bagNumber);
    }
    return bag;
};

const moveLocally = (
    current: HerbBag[],
    fromBag: number,
    stackId: string,
    toBag: number,
    allocateId: () => string,
): { next: HerbBag[]; moved: HerbStack } | null => {
    const cloned = current.map(b => ({
        bagNumber: b.bagNumber,
        items: b.items.map(item => ({ ...item })),
        condition: b.condition,
    }));
    const source = cloned.find(b => b.bagNumber === fromBag);
    if (!source) {
        return null;
    }
    const index = source.items.findIndex(item => item.instanceId === stackId);
    if (index === -1) {
        return null;
    }
    const [stack] = source.items.splice(index, 1);
    if (!stack) {
        return null;
    }
    const moved: HerbStack = { ...stack, isSplit: false, instanceId: allocateId() };
    source.items = sortItems(source.items);
    const target = ensureBag(cloned, toBag);
    const existingIndex = target.items.findIndex(item => item.herbId === moved.herbId && !item.isSplit);
    if (existingIndex >= 0) {
        const existing = target.items[existingIndex];
        target.items[existingIndex] = { ...existing, count: existing.count + moved.count };
    } else {
        target.items = sortItems([...target.items, moved]);
    }
    return { next: cloned, moved };
};

const getInitialCounts = (): HerbCounts => {
    const stored = characterStorage.get("herb_counts");
    if (!stored) {
        return undefined;
    }
    return normalizeHerbBagsState(stored);
};

const clamp = (value: number, min: number, max: number) => {
    if (max < min) {
        return min;
    }
    return Math.min(Math.max(value, min), max);
};

const getHerbStyle = (herbId: string): HerbPillStyle => {
    const cached = herbStyleCache.get(herbId);
    if (cached) {
        return cached;
    }

    let hash = 0;
    for (let index = 0; index < herbId.length; index += 1) {
        hash = ((hash << 5) - hash + herbId.charCodeAt(index)) >>> 0;
    }

    const hue = hash % 360;
    const saturation = clamp(58 + (hash % 18), 52, 82);
    const baseLightness = clamp(26 + ((hash >> 3) % 18), 22, 54);
    const depthLightness = clamp(baseLightness - 10, 10, 40);
    const hoverLightness = clamp(baseLightness + 8, 32, 72);
    const accentLightness = clamp(baseLightness + 26, 48, 92);
    const splitLightness = clamp(baseLightness + 16, 34, 80);

    const style: HerbPillStyle = {
        "--herb-pill-bg": `linear-gradient(145deg, hsl(${hue} ${saturation}% ${baseLightness}% / 0.96), hsl(${hue} ${clamp(
            saturation - 10,
            35,
            88,
        )}% ${depthLightness}% / 0.98))`,
        "--herb-pill-bg-hover": `linear-gradient(145deg, hsl(${hue} ${clamp(saturation + 6, 40, 96)}% ${hoverLightness}% / 0.98), hsl(${hue} ${clamp(
            saturation - 4,
            32,
            88,
        )}% ${baseLightness}% / 0.98))`,
        "--herb-pill-border": `hsl(${hue} ${clamp(saturation + 14, 45, 98)}% ${accentLightness}% / 0.9)`,
        "--herb-pill-border-hover": `hsl(${hue} ${clamp(saturation + 20, 52, 99)}% ${clamp(accentLightness + 6, 55, 97)}% / 0.95)`,
        "--herb-pill-bg-split": `linear-gradient(145deg, hsl(${hue} ${clamp(saturation + 10, 40, 99)}% ${splitLightness}% / 0.98), hsl(${hue} ${clamp(
            saturation,
            35,
            92,
        )}% ${clamp(baseLightness + 10, 28, 74)}% / 0.98))`,
        "--herb-pill-border-split": `hsl(${hue} ${clamp(saturation + 24, 55, 99)}% ${clamp(accentLightness + 14, 62, 99)}% / 0.98)`,
        "--herb-pill-text": `hsl(${hue} 20% 96% / 0.98)`,
    };

    herbStyleCache.set(herbId, style);
    return style;
};

const HerbManager = () => {
    const idCounter = useRef(0);
    const nextInstanceId = () => `stack-${idCounter.current++}`;
    const rebuildBags = (counts?: HerbCounts) => {
        idCounter.current = 0;
        const normalized = counts ? normalizeHerbBagsState(counts) : undefined;
        return buildBags(normalized, nextInstanceId);
    };

    const [bags, setBags] = useState<HerbBag[]>(() => rebuildBags(getInitialCounts()));
    const [activeBag, setActiveBag] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const herbsDataRef = useRef<HerbsData | null>(null);
    const herbsDataPromiseRef = useRef<Promise<HerbsData | null> | null>(null);

    const closeContextMenu = useCallback(() => {
        hideContextMenu();
    }, []);

    // Custom close that also hides context menu
    const handleClose = useCallback(() => {
        closeContextMenu();
    }, [closeContextMenu]);

    const { wrapperProps, isOpen, isPinned, setIsOpen } = usePopup(POPUP_ID);
    const [isCompact, setIsCompact] = usePopupSetting(POPUP_ID, 'isCompact', false);
    const [showEffects, setShowEffects] = usePopupSetting(POPUP_ID, 'showEffects', false);

    // Wrap close to also hide context menu
    const wrappedOnClose = useCallback(() => {
        closeContextMenu();
        wrapperProps.onClose();
    }, [closeContextMenu, wrapperProps]);

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

    useEffect(() => {
        if (showEffects) {
            void ensureHerbsData();
        }
    }, [showEffects, ensureHerbsData]);

    // Check if popup is managed by layout to determine overlay visibility
    const layoutContext = useLayoutManagerOptional();
    const isLayoutManaged = layoutContext?.isLayoutMode === true;

    useEffect(() => {
        if (!isOpen) return;
        const unsubscribe = eventBus.on("herbCounts", (detail) => {
            if (detail && typeof detail === "object") {
                setError(null);
                setBags(rebuildBags(detail as HerbCounts));
            }
        });
        return () => unsubscribe();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuildBags is stable
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        eventBus.emit('requestHerbCounts');
    }, [isOpen]);

    useEffect(() => {
        const unsubscribeOpen = eventBus.on("herbManagerOpen", () => {
            setError(null);
            setIsOpen(true);
        });
        const unsubscribeClose = eventBus.on("herbManagerClose", () => {
            handleClose();
            setIsOpen(false);
        });
        return () => {
            unsubscribeOpen();
            unsubscribeClose();
        };
    }, [handleClose, setIsOpen]);

    useEffect(() => {
        if (!isOpen) {
            setActiveBag(null);
        }
    }, [isOpen]);

    const handleSplit = (bagNumber: number, stack: HerbStack) => (event: React.MouseEvent) => {
        if (!event.shiftKey) {
            return;
        }
        event.preventDefault();
        if (stack.isSplit) {
            setBags(prev => prev.map(bag => {
                if (bag.bagNumber !== bagNumber) {
                    return bag;
                }
                const remaining = bag.items
                    .filter(item => item.instanceId !== stack.instanceId)
                    .map(item => ({ ...item }));
                const existingIndex = remaining.findIndex(item => item.herbId === stack.herbId && !item.isSplit);
                if (existingIndex >= 0) {
                    const existing = remaining[existingIndex];
                    remaining[existingIndex] = { ...existing, count: existing.count + stack.count };
                } else {
                    remaining.push({ herbId: stack.herbId, count: stack.count, instanceId: nextInstanceId() });
                }
                return { bagNumber, items: sortItems(remaining) };
            }));
            return;
        }
        if (stack.count < 2) {
            return;
        }
        const half = Math.floor(stack.count / 2);
        const remainder = stack.count - half;
        if (half <= 0 || remainder <= 0) {
            return;
        }
        setBags(prev => prev.map(bag => {
            if (bag.bagNumber !== bagNumber) {
                return bag;
            }
            const items = bag.items.map(item => item.instanceId === stack.instanceId ? { ...item, count: remainder } : { ...item });
            items.push({ herbId: stack.herbId, count: half, instanceId: nextInstanceId(), isSplit: true });
            return { bagNumber, items: sortItems(items) };
        }));
    };

    const performMove = (fromBag: number, stackId: string, toBag: number) => {
        if (busy || fromBag === toBag) {
            return;
        }
        const moveResult = moveLocally(bags, fromBag, stackId, toBag, nextInstanceId);
        if (!moveResult) {
            return;
        }
        setError(null);
        setBags(moveResult.next);
        setBusy(true);
        const manager = getHerbManager();
        const payload: HerbMoveOptions = {
            herbId: moveResult.moved.herbId,
            amount: moveResult.moved.count,
            fromBag,
            toBag,
        };
        if (!manager) {
            setError("Brak połączenia z licznikiem ziół.");
            setBusy(false);
            eventBus.emit('requestHerbCounts');
            return;
        }
        Promise.resolve(manager.move(payload))
            .catch(err => {
                const message = err instanceof Error ? err.message : "Nie udało się przenieść ziół.";
                setError(message);
                eventBus.emit('requestHerbCounts');
            })
            .finally(() => {
                setBusy(false);
            });
    };

    const handleDrop = (targetBag: number) => (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setActiveBag(null);
        const raw = event.dataTransfer.getData("application/json") || event.dataTransfer.getData("text/plain");
        if (!raw) {
            return;
        }
        try {
            const payload = JSON.parse(raw) as DragPayload;
            if (typeof payload.bagNumber === "number" && typeof payload.stackId === "string") {
                performMove(payload.bagNumber, payload.stackId, targetBag);
            }
        } catch {
            // ignore malformed payload
        }
    };

    const handleDragStart = (bagNumber: number, stack: HerbStack) => (event: React.DragEvent<HTMLButtonElement>) => {
        if (busy) {
            event.preventDefault();
            return;
        }
        const payload: DragPayload = { bagNumber, stackId: stack.instanceId };
        const serialized = JSON.stringify(payload);
        event.dataTransfer.setData("application/json", serialized);
        event.dataTransfer.setData("text/plain", serialized);
        event.dataTransfer.effectAllowed = "move";
        setActiveBag(bagNumber);
    };

    const handleDragEnd = () => {
        setActiveBag(null);
    };

    const handleDragOver = (bagNumber: number) => (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setActiveBag(bagNumber);
    };

    const handleDragLeave = (bagNumber: number) => (event: React.DragEvent<HTMLDivElement>) => {
        const related = event.relatedTarget as Node | null;
        if (!related || !event.currentTarget.contains(related)) {
            setActiveBag(prev => (prev === bagNumber ? null : prev));
        }
    };

    const handleContextMenu = (stack: HerbStack) => async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        const { pageX, pageY } = event;
        const data = herbsDataRef.current ?? (await ensureHerbsData());
        if (!data) {
            return;
        }
        const actions = data.herb_id_to_use?.[stack.herbId];
        if (!actions || actions.length === 0) {
            return;
        }
        openHerbContextMenu({
            herbId: stack.herbId,
            actions,
            x: pageX,
            y: pageY,
            commandPrefix: "/zi",
        });
    };

    const emptyState = useMemo(() => bags.length === 0 || bags.every(bag => bag.items.length === 0), [bags]);

    // Calculate optimal grid columns based on bag count
    const gridStyle = useMemo(() => {
        const bagCount = bags.length;
        if (bagCount === 0) return undefined;

        // For small numbers of bags, use exact columns to avoid stretching
        if (bagCount <= 2) {
            return { gridTemplateColumns: `repeat(${bagCount}, minmax(200px, 300px))` };
        }
        if (bagCount <= 4) {
            return { gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' };
        }
        // For larger counts, use auto-fill with standard minmax
        return undefined; // Use CSS default
    }, [bags.length]);

    const headerActions = useMemo(() => (
        <>
            <button
                type="button"
                className={`herb-window__toggle${showEffects ? ' herb-window__toggle--active' : ''}`}
                onClick={() => setShowEffects(!showEffects)}
                title={showEffects ? 'Ukryj efekty' : 'Pokaż efekty ziół'}
            >
                Efekty
            </button>
            <button
                type="button"
                className={`herb-window__toggle${isCompact ? ' herb-window__toggle--active' : ''}`}
                onClick={() => setIsCompact(!isCompact)}
                title={isCompact ? 'Widok normalny' : 'Widok kompaktowy'}
            >
                Kompaktowy
            </button>
        </>
    ), [showEffects, isCompact, setShowEffects, setIsCompact]);

    const handleBackdropClick = () => {
        if (isPinned) {
            return;
        }
        handleClose();
        setIsOpen(false);
    };

    // Render overlay only when NOT in layout managed mode and open
    const showOverlay = isOpen && !isLayoutManaged;

    return (
        <>
            {showOverlay && (
                <div
                    className={`herb-overlay${isPinned ? " herb-overlay--pinned" : ""}`}
                    role="presentation"
                    onClick={handleBackdropClick}
                />
            )}
            <DockablePopupWrapper
                {...wrapperProps}
                onClose={wrappedOnClose}
                popupType="herb"
                title="Woreczki ziół"
                minWidth={300}
                minHeight={200}
                initialWidth={1000}
                initialHeight={500}
                className="herb-window"
                bodyClassName="herb-window-body"
                headerActions={headerActions}
            >
                <div
                    className={`herb-manager${busy ? " herb-manager--busy" : ""}${isCompact ? " herb-manager--compact" : ""}`}
                    onPointerDownCapture={closeContextMenu}
                >
                    {error && (
                        <div className="alert alert-danger herb-manager-status" role="alert">
                            {error}
                        </div>
                    )}
                    {emptyState ? (
                        <div className="alert alert-info herb-manager-status" role="alert">
                            Brak danych o woreczkach. Użyj aliasu <code>/ziola_buduj</code>, aby odświeżyć zawartość.
                        </div>
                    ) : (
                        <div className="herb-grid" style={gridStyle}>
                            {bags.map(bag => {
                                const totalCount = bag.items.reduce((sum, item) => sum + item.count, 0);
                                const conditionValue =
                                    typeof bag.condition === "number"
                                        ? Math.min(5, Math.max(1, Math.round(bag.condition)))
                                        : null;
                                return (
                                    <div
                                        key={bag.bagNumber}
                                        className={`herb-bag${activeBag === bag.bagNumber ? " herb-bag-drop-target" : ""}`}
                                        onDragOver={handleDragOver(bag.bagNumber)}
                                        onDrop={handleDrop(bag.bagNumber)}
                                        onDragLeave={handleDragLeave(bag.bagNumber)}
                                    >
                                        <div className="herb-bag-header">
                                            <span>Woreczek {bag.bagNumber}</span>
                                            <div className="herb-bag-meta">
                                                {conditionValue !== null && (
                                                    <span
                                                        className={`herb-bag-condition herb-bag-condition--${getConditionVariant(conditionValue)}`}
                                                        title={`Stan woreczka: ${conditionValue}/5`}
                                                    >
                                                        {conditionValue}/5
                                                    </span>
                                                )}
                                                <span className="herb-bag-count">{totalCount} szt.</span>
                                            </div>
                                        </div>
                                        <div className="herb-bag-content">
                                            {bag.items.length === 0 ? (
                                                <div className="herb-bag-empty">Pusty woreczek</div>
                                            ) : (
                                                bag.items.map(stack => {
                                                    const effects = showEffects
                                                        ? (herbsDataRef.current?.herb_id_to_use[stack.herbId] ?? [])
                                                        : [];
                                                    return (
                                                        <button
                                                            key={stack.instanceId}
                                                            type="button"
                                                            className={`herb-pill${stack.isSplit ? " herb-pill-split" : ""}${showEffects ? " herb-pill--with-effects" : ""}`}
                                                            style={getHerbStyle(stack.herbId)}
                                                            draggable={!busy}
                                                            onDragStart={handleDragStart(bag.bagNumber, stack)}
                                                            onDragEnd={handleDragEnd}
                                                            onClick={handleSplit(bag.bagNumber, stack)}
                                                            onContextMenu={handleContextMenu(stack)}
                                                        >
                                                            {effects.length > 0 ? (
                                                                <span className="herb-pill-row">
                                                                    <span className="herb-pill-count">{stack.count} ×</span>
                                                                    <span className="herb-pill-label">{stack.herbId}</span>
                                                                </span>
                                                            ) : (
                                                                <>
                                                                    <span className="herb-pill-count">{stack.count} ×</span>
                                                                    <span className="herb-pill-label">{stack.herbId}</span>
                                                                </>
                                                            )}
                                                            {effects.length > 0 && (() => {
                                                                const grouped = Array.from(effects.reduce((map, use) => {
                                                                    const stripped = stripMudletColors(use.effect).trim();
                                                                    if (!stripped || stripped === '--' || stripped === '---' || stripped === 'tr') return map;
                                                                    const list = map.get(use.action) ?? [];
                                                                    list.push(stripped);
                                                                    map.set(use.action, list);
                                                                    return map;
                                                                }, new Map<string, string[]>()));
                                                                if (grouped.length === 0) return null;
                                                                return (
                                                                    <span className="herb-pill-effects">
                                                                        {grouped.map(([action, effs]) => (
                                                                            <span key={action} className="herb-pill-effect">
                                                                                {effs.join(', ')}
                                                                            </span>
                                                                        ))}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </button>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DockablePopupWrapper>
        </>
    );
};

export default HerbManager;
