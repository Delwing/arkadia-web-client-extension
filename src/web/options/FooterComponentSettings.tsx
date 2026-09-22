import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from "react";
import { Check } from "@web-ui/primitives/index.ts";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from "@dnd-kit/core";
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { getAllFooterItems, subscribeFooterItems } from "@modules/core/footerRegistry";
import { domId, merge, toConfig, type FooterRow } from "./footerComponentRows";
import type { FooterComponentConfig } from "../defaultUiSettings";


interface SortableItemProps {
    item: FooterRow;
    onToggle: (id: string) => void;
}

function SortableItem({ item, onToggle }: SortableItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: domId(item.id) });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : 0,
    };

    return (
        <div ref={setNodeRef} className={`settings-sort-item${item.visible ? '' : ' is-off'}`} style={style}>
            <span {...attributes} {...listeners} className="settings-sort-item__handle">
                &#x2630;
            </span>
            <Check
                id={`fc-${domId(item.id)}`}
                title="Widoczny"
                checked={item.visible}
                onChange={() => onToggle(item.id)}
            />
            <label className="settings-sort-item__label" htmlFor={`fc-${domId(item.id)}`}>
                {item.label}
            </label>
            {item.fromPlugin && <span className="settings-sort-item__badge">plugin</span>}
        </div>
    );
}

interface FooterComponentSettingsProps {
    components: FooterComponentConfig[];
    onChange: (components: FooterComponentConfig[]) => void;
}

function FooterComponentSettings({ components, onChange }: FooterComponentSettingsProps) {
    // The live registry, so components registered by plugins can be listed and
    // ordered alongside the built-in chips. Plugins come and go while the panel
    // is open - one being loaded should add a row, not require a reload.
    const registered = useSyncExternalStore(subscribeFooterItems, getAllFooterItems, getAllFooterItems);

    const rows = useMemo(() => merge(components, registered), [components, registered]);

    const [items, setItems] = useState<FooterRow[]>(rows);

    useEffect(() => {
        setItems(rows);
    }, [rows]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const commit = useCallback((updated: FooterRow[]) => {
        const normalized = updated.map((c, i) => ({ ...c, order: i }));
        setItems(normalized);
        onChange(toConfig(normalized, components));
    }, [onChange, components]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex(c => domId(c.id) === active.id);
            const newIndex = items.findIndex(c => domId(c.id) === over.id);
            if (oldIndex < 0 || newIndex < 0) return;
            commit(arrayMove(items, oldIndex, newIndex));
        }
    };

    const toggleVisibility = (id: string) => {
        commit(items.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(c => domId(c.id))} strategy={verticalListSortingStrategy}>
                <div className="settings-sort-list">
                    {items.map(item => (
                        <SortableItem key={item.id} item={item} onToggle={toggleVisibility} />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}

export default FooterComponentSettings;
