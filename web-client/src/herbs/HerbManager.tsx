import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getItemSync } from "@client/src/storage";
import type { HerbBagsState, HerbManagerApi, HerbMoveOptions } from "@client/src/types/herbs";

type HerbCounts = Record<string | number, Record<string, number>>;

interface HerbStack {
    instanceId: string;
    herbId: string;
    count: number;
    isSplit?: boolean;
}

interface HerbBag {
    bagNumber: number;
    items: HerbStack[];
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

const buildBags = (source: HerbCounts | undefined, allocateId: () => string): HerbBag[] => {
    if (!source) {
        return [];
    }
    const entries = Object.entries(source);
    const bags: HerbBag[] = entries
        .map(([key, contents]) => {
            const bagNumber = Number(key);
            if (!Number.isFinite(bagNumber)) {
                return null;
            }
            const normalized = typeof contents === "object" && contents ? contents : {};
            const items: HerbStack[] = Object.entries(normalized)
                .filter(([, count]) => typeof count === "number" && count > 0)
                .map(([herbId, count]) => ({
                    herbId,
                    count,
                    instanceId: allocateId(),
                }))
                .sort((a, b) => a.herbId.localeCompare(b.herbId));
            return { bagNumber, items } as HerbBag;
        })
        .filter((bag): bag is HerbBag => !!bag)
        .sort((a, b) => a.bagNumber - b.bagNumber);
    return bags;
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

const getInitialCounts = (): HerbCounts | undefined => {
    const stored = getItemSync("herb_counts");
    const value = stored ? (stored.herb_counts as HerbCounts | undefined) : undefined;
    return value;
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
        return buildBags(counts, nextInstanceId);
    };

    const [bags, setBags] = useState<HerbBag[]>(() => rebuildBags(getInitialCounts()));
    const [activeBag, setActiveBag] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const dragState = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null);

    useEffect(() => {
        const handler = (ev: Event) => {
            const detail = (ev as CustomEvent<HerbBagsState>).detail;
            if (detail && typeof detail === "object") {
                setError(null);
                setBags(rebuildBags(detail));
            }
        };
        window.addEventListener("herbCounts", handler as EventListener);
        return () => window.removeEventListener("herbCounts", handler as EventListener);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        window.dispatchEvent(new Event("request-herb-counts"));
        panelRef.current?.focus();
    }, [isOpen]);

    useEffect(() => {
        const openHandler = () => {
            setError(null);
            setIsOpen(true);
        };
        const closeHandler = () => {
            setIsOpen(false);
        };
        window.addEventListener("herbManagerOpen", openHandler);
        window.addEventListener("herbManagerClose", closeHandler);
        return () => {
            window.removeEventListener("herbManagerOpen", openHandler);
            window.removeEventListener("herbManagerClose", closeHandler);
        };
    }, []);

    useEffect(() => {
        if (!isOpen) {
            setActiveBag(null);
            return;
        }
        const handleKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                event.preventDefault();
                setIsOpen(false);
            }
        };
        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, [isOpen]);

    const handleResize = useCallback(() => {
        setPosition(prev => {
            if (!prev || !panelRef.current) {
                return prev;
            }
            const rect = panelRef.current.getBoundingClientRect();
            const margin = 16;
            const maxLeft = window.innerWidth - rect.width - margin;
            const maxTop = window.innerHeight - rect.height - margin;
            const nextLeft = clamp(prev.left, margin, maxLeft);
            const nextTop = clamp(prev.top, margin, maxTop);
            if (nextLeft === prev.left && nextTop === prev.top) {
                return prev;
            }
            return { left: nextLeft, top: nextTop };
        });
    }, []);

    useEffect(() => {
        if (!isOpen) {
            return;
        }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, [handleResize, isOpen]);

    const handlePointerMove = useCallback((event: PointerEvent) => {
        const drag = dragState.current;
        if (!drag || event.pointerId !== drag.pointerId || !panelRef.current) {
            return;
        }
        const rect = panelRef.current.getBoundingClientRect();
        const margin = 16;
        const nextLeft = event.clientX - drag.offsetX;
        const nextTop = event.clientY - drag.offsetY;
        const maxLeft = window.innerWidth - rect.width - margin;
        const maxTop = window.innerHeight - rect.height - margin;
        setPosition({
            left: clamp(nextLeft, margin, maxLeft),
            top: clamp(nextTop, margin, maxTop),
        });
    }, []);

    const endPointerDrag = useCallback((event: PointerEvent) => {
        const drag = dragState.current;
        if (!drag || event.pointerId !== drag.pointerId) {
            return;
        }
        dragState.current = null;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", endPointerDrag);
        window.removeEventListener("pointercancel", endPointerDrag);
    }, [handlePointerMove]);

    useEffect(() => {
        return () => {
            window.removeEventListener("pointermove", handlePointerMove);
            window.removeEventListener("pointerup", endPointerDrag);
            window.removeEventListener("pointercancel", endPointerDrag);
        };
    }, [endPointerDrag, handlePointerMove]);

    const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 0) {
            return;
        }
        if (!panelRef.current) {
            return;
        }
        const rect = panelRef.current.getBoundingClientRect();
        dragState.current = {
            pointerId: event.pointerId,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
        };
        setPosition(prev => prev ?? { left: rect.left, top: rect.top });
        window.addEventListener("pointermove", handlePointerMove);
        window.addEventListener("pointerup", endPointerDrag);
        window.addEventListener("pointercancel", endPointerDrag);
        event.preventDefault();
    };

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
        const manager = (window as any).clientExtension?.herbManager as HerbManagerApi | undefined;
        const payload: HerbMoveOptions = {
            herbId: moveResult.moved.herbId,
            amount: moveResult.moved.count,
            fromBag,
            toBag,
        };
        if (!manager) {
            setError("Brak połączenia z licznikiem ziół.");
            setBusy(false);
            window.dispatchEvent(new Event("request-herb-counts"));
            return;
        }
        Promise.resolve(manager.move(payload))
            .catch(err => {
                const message = err instanceof Error ? err.message : "Nie udało się przenieść ziół.";
                setError(message);
                window.dispatchEvent(new Event("request-herb-counts"));
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

    const emptyState = useMemo(() => bags.length === 0 || bags.every(bag => bag.items.length === 0), [bags]);

    const handleClose = () => {
        setIsOpen(false);
    };

    const handleBackdropClick = () => {
        handleClose();
    };

    if (!isOpen) {
        return null;
    }

    const containerStyle = position
        ? { top: `${position.top}px`, left: `${position.left}px` }
        : undefined;

    return (
        <>
            <div className="herb-overlay" role="presentation" onClick={handleBackdropClick} />
            <div
                ref={panelRef}
                className={`herb-window${position ? " herb-window--floating" : " herb-window--center"}`}
                style={containerStyle}
                role="dialog"
                aria-modal="true"
                aria-label="Woreczki ziół"
                tabIndex={-1}
                onClick={event => event.stopPropagation()}
            >
                <div className="herb-window-header" onPointerDown={handlePointerDown}>
                    <h5 className="herb-window-title">Woreczki ziół</h5>
                    <button type="button" className="btn-close" aria-label="Zamknij" onClick={handleClose} />
                </div>
                <div className="herb-window-body">
                    <div className={`herb-manager${busy ? " herb-manager--busy" : ""}`}>
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
                            <div className="herb-grid">
                                {bags.map(bag => (
                                    <div
                                        key={bag.bagNumber}
                                        className={`herb-bag${activeBag === bag.bagNumber ? " herb-bag-drop-target" : ""}`}
                                        onDragOver={handleDragOver(bag.bagNumber)}
                                        onDrop={handleDrop(bag.bagNumber)}
                                        onDragLeave={handleDragLeave(bag.bagNumber)}
                                    >
                                        <div className="herb-bag-header">
                                            <span>Woreczek {bag.bagNumber}</span>
                                            <span className="herb-bag-count">
                                                {bag.items.reduce((sum, item) => sum + item.count, 0)} szt.
                                            </span>
                                        </div>
                                        <div className="herb-bag-content">
                                            {bag.items.length === 0 ? (
                                                <div className="herb-bag-empty">Pusty woreczek</div>
                                            ) : (
                                                bag.items.map(stack => (
                                                    <button
                                                        key={stack.instanceId}
                                                        type="button"
                                                        className={`herb-pill${stack.isSplit ? " herb-pill-split" : ""}`}
                                                        style={getHerbStyle(stack.herbId)}
                                                        draggable={!busy}
                                                        onDragStart={handleDragStart(bag.bagNumber, stack)}
                                                        onDragEnd={handleDragEnd}
                                                        onClick={handleSplit(bag.bagNumber, stack)}
                                                    >
                                                        <span className="herb-pill-count">{stack.count} ×</span>
                                                        <span className="herb-pill-label">{stack.herbId}</span>
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default HerbManager;
