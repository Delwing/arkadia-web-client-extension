import { useState, useEffect, useCallback } from "react";
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

const DISPLAY_NAMES: Record<string, string> = {
    hp: 'HP',
    fatigue: 'Zmeczenie',
    stuffed: 'Glod',
    encumbrance: 'Obciazenie',
    soaked: 'Pragnienie',
    mana: 'Mana',
    improve: 'Postep',
    form: 'Forma',
    intox: 'Upojenie',
    headache: 'Kac',
    panic: 'Panika',
};

interface BarItem {
    id: string;
    alwaysVisible: boolean;
}

interface SortableBarItemProps {
    item: BarItem;
    hasDefault: boolean;
    onToggle: (id: string) => void;
}

function SortableBarItem({ item, hasDefault, onToggle }: SortableBarItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: item.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : 0,
    };

    return (
        <div ref={setNodeRef} className="settings-sort-item" style={style}>
            <span {...attributes} {...listeners} className="settings-sort-item__handle">
                &#x2630;
            </span>
            <span className="settings-sort-item__label">
                {DISPLAY_NAMES[item.id] || item.id}
            </span>
            {hasDefault && (
                <Check
                    id={`avb-${item.id}`}
                    label="zawsze"
                    title="Zawsze widoczny"
                    checked={item.alwaysVisible}
                    onChange={() => onToggle(item.id)}
                />
            )}
        </div>
    );
}

const BARS_WITH_DEFAULT = new Set([
    'mana', 'stuffed', 'encumbrance', 'soaked', 'improve', 'form', 'intox', 'headache', 'panic',
]);

interface BarOrderSettingsProps {
    barOrder: string[];
    alwaysVisibleBars: string[];
    onChange: (barOrder: string[], alwaysVisibleBars: string[]) => void;
}

function BarOrderSettings({ barOrder, alwaysVisibleBars, onChange }: BarOrderSettingsProps) {
    const [items, setItems] = useState<BarItem[]>(() =>
        barOrder.map(id => ({ id, alwaysVisible: alwaysVisibleBars.includes(id) }))
    );

    useEffect(() => {
        setItems(barOrder.map(id => ({ id, alwaysVisible: alwaysVisibleBars.includes(id) })));
    }, [barOrder, alwaysVisibleBars]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const commit = useCallback((updated: BarItem[]) => {
        setItems(updated);
        onChange(
            updated.map(i => i.id),
            updated.filter(i => i.alwaysVisible).map(i => i.id),
        );
    }, [onChange]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex(i => i.id === active.id);
            const newIndex = items.findIndex(i => i.id === over.id);
            commit(arrayMove(items, oldIndex, newIndex));
        }
    };

    const toggleAlwaysVisible = (id: string) => {
        commit(items.map(i => i.id === id ? { ...i, alwaysVisible: !i.alwaysVisible } : i));
    };

    const allWithDefault = items.filter(i => BARS_WITH_DEFAULT.has(i.id));
    const allChecked = allWithDefault.length > 0 && allWithDefault.every(i => i.alwaysVisible);

    const toggleAll = () => {
        const newValue = !allChecked;
        commit(items.map(i => BARS_WITH_DEFAULT.has(i.id) ? { ...i, alwaysVisible: newValue } : i));
    };

    return (
        <>
            <Check
                id="avb-all"
                label="Wszystkie zawsze widoczne"
                checked={allChecked}
                onChange={toggleAll}
            />
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
                    <div className="settings-sort-list">
                        {items.map(item => (
                            <SortableBarItem
                                key={item.id}
                                item={item}
                                hasDefault={BARS_WITH_DEFAULT.has(item.id)}
                                onToggle={toggleAlwaysVisible}
                            />
                        ))}
                    </div>
                </SortableContext>
            </DndContext>
        </>
    );
}

export default BarOrderSettings;
