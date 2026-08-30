import { useState, useEffect, useCallback } from "react";
import { Form } from "react-bootstrap";
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
import type { FooterComponentConfig } from "../defaultUiSettings";

const DISPLAY_NAMES: Record<string, string> = {
    'clock-display': 'Zegar',
    'transport-timer': 'Timer transportu',
    'lamp-timer': 'Timer lampy',
    'pipe-status': 'Fajka',
    'break-item-warning': 'Ostrzezenie o uszkodzeniu',
    'mail-status': 'Status poczty',
    'package-status': 'Status paczki',
    'weapon-state': 'Stan broni',
    'attack-mode': 'Tryb ataku',
    'release-guard-timer': 'Timer zasloniecia',
    'zask-timer': 'Timer zaskoczenia',
    'order-timer': 'Timer rozkazu',
    'combat-timer': 'Timer walki (30s)',
    'world-destruction-timer': 'Timer apokalipsy',
    'team-panel': 'Panel druzyny',
    'connection-status': 'Ping i zegar proxy',
};

interface SortableItemProps {
    item: FooterComponentConfig;
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
    } = useSortable({ id: item.id });

    const style: React.CSSProperties = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 1 : 0,
    };

    return (
        <div
            ref={setNodeRef}
            className="d-flex align-items-center gap-2 p-1 border rounded"
            style={{ ...style, background: 'var(--popup-control-bg)' }}
        >
            <span
                {...attributes}
                {...listeners}
                className="text-muted"
                style={{ cursor: 'grab', userSelect: 'none', touchAction: 'none' }}
            >
                &#x2630;
            </span>
            <Form.Check
                type="switch"
                id={`fc-${item.id}`}
                checked={item.visible}
                onChange={() => onToggle(item.id)}
            />
            <span className={item.visible ? '' : 'text-muted'} style={{ fontSize: '0.85rem' }}>
                {DISPLAY_NAMES[item.id] || item.id}
            </span>
        </div>
    );
}

interface FooterComponentSettingsProps {
    components: FooterComponentConfig[];
    onChange: (components: FooterComponentConfig[]) => void;
}

function FooterComponentSettings({ components, onChange }: FooterComponentSettingsProps) {
    const [items, setItems] = useState<FooterComponentConfig[]>(() =>
        [...components].sort((a, b) => a.order - b.order)
    );

    useEffect(() => {
        setItems([...components].sort((a, b) => a.order - b.order));
    }, [components]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const commit = useCallback((updated: FooterComponentConfig[]) => {
        const normalized = updated.map((c, i) => ({ ...c, order: i }));
        setItems(normalized);
        onChange(normalized);
    }, [onChange]);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = items.findIndex(c => c.id === active.id);
            const newIndex = items.findIndex(c => c.id === over.id);
            commit(arrayMove(items, oldIndex, newIndex));
        }
    };

    const toggleVisibility = (id: string) => {
        commit(items.map(c => c.id === id ? { ...c, visible: !c.visible } : c));
    };

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map(c => c.id)} strategy={verticalListSortingStrategy}>
                <div className="d-flex flex-column gap-1">
                    {items.map(item => (
                        <SortableItem key={item.id} item={item} onToggle={toggleVisibility} />
                    ))}
                </div>
            </SortableContext>
        </DndContext>
    );
}

export default FooterComponentSettings;
