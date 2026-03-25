import React, { useState, useCallback, useEffect, useRef } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';

interface DemoObject {
    id: number;
    desc: string;
    hp: number;
    isTeam: boolean;
    isLeader: boolean;
    isAttacking: boolean;
    attackTarget: number | null;
    isAttackTarget: boolean;
    isDefenseTarget: boolean;
    isAvatarTarget: boolean;
}

const POPUP_ID = 'popup:objectListDemo';

const DEFAULT_OBJECTS: DemoObject[] = [
    { id: 99, desc: 'Ty (gracz)', hp: 6, isTeam: false, isLeader: true, isAttacking: false, attackTarget: null, isAttackTarget: false, isDefenseTarget: false, isAvatarTarget: false },
    { id: 101, desc: 'Wojownik druzyny', hp: 5, isTeam: true, isLeader: false, isAttacking: true, attackTarget: 201, isAttackTarget: false, isDefenseTarget: false, isAvatarTarget: false },
    { id: 102, desc: 'Mag druzyny', hp: 4, isTeam: true, isLeader: false, isAttacking: false, attackTarget: null, isAttackTarget: false, isDefenseTarget: true, isAvatarTarget: false },
    { id: 201, desc: 'Goblin wojownik', hp: 3, isTeam: false, isLeader: false, isAttacking: true, attackTarget: 99, isAttackTarget: true, isDefenseTarget: false, isAvatarTarget: true },
    { id: 202, desc: 'Goblin lucznik', hp: 5, isTeam: false, isLeader: false, isAttacking: true, attackTarget: 101, isAttackTarget: false, isDefenseTarget: false, isAvatarTarget: false },
    { id: 203, desc: 'Goblin szaman', hp: 6, isTeam: false, isLeader: false, isAttacking: false, attackTarget: null, isAttackTarget: false, isDefenseTarget: false, isAvatarTarget: false },
];

const ObjectListDemoPopup: React.FC = () => {
    const { wrapperProps, setIsOpen, isOpen } = usePopup(POPUP_ID);
    const [objects, setObjects] = useState<DemoObject[]>(DEFAULT_OBJECTS);
    const [isLeader, setIsLeader] = useState(true);
    const [nextId, setNextId] = useState(300);
    const isFirstRender = useRef(true);

    const applyDemo = useCallback(() => {
        // Build GMCP data
        const gmcpData: Record<string, any> = {};
        const playerObj = objects.find(o => o.id === 99);

        // Find avatar target - the player's current attack target
        const avatarTargetObj = objects.find(o => o.isAvatarTarget);
        const playerAttackTarget = avatarTargetObj?.id || null;

        objects.forEach(obj => {
            const isPlayer = obj.id === 99;
            // Player needs team: true when they're the leader for TeamManager to recognize them
            const isPlayerLeader = isPlayer && isLeader;

            // Player's attack_num should be set to avatar target
            let attackNum: number | boolean = obj.isAttacking ? (obj.attackTarget || true) : false;
            if (isPlayer && playerAttackTarget) {
                attackNum = playerAttackTarget;
            }

            gmcpData[String(obj.id)] = {
                desc: obj.desc,
                hp: obj.hp,
                avatar: isPlayer,
                team: obj.isTeam || isPlayerLeader,
                team_leader: isPlayerLeader || (obj.isLeader && !isPlayer),
                attack_num: attackNum,
                attack_target: obj.isAttackTarget,
                defense_target: obj.isDefenseTarget,
                avatar_target: obj.isAvatarTarget,
                enemy: !isPlayer && !obj.isTeam,
            };
        });

        // Emit GMCP events via eventBus in correct order:
        // 1. char.info first - sets playerNum in TeamManager
        // 2. objects.data - TeamManager auto-detects team members via checkTeam
        // 3. objects.nums - triggers final render
        eventBus.emit('gmcp.char.info', {
            object_num: 99,
            name: playerObj?.desc || 'Gracz'
        });
        eventBus.emit('gmcp.char.state', { hp: (playerObj?.hp ?? 6) });
        eventBus.emit('gmcp.objects.data', gmcpData as any);
        eventBus.emit('gmcp.objects.nums', objects.map(o => o.id));
    }, [objects, isLeader]);

    // Auto-apply when objects or isLeader changes (but not on first render)
    useEffect(() => {
        if (isFirstRender.current) {
            isFirstRender.current = false;
            return;
        }
        if (isOpen) {
            applyDemo();
        }
    }, [objects, isLeader, applyDemo, isOpen]);

    // Apply on open
    useEffect(() => {
        if (isOpen) {
            applyDemo();
        }
    }, [isOpen, applyDemo]);

    const resetToDefault = useCallback(() => {
        setObjects(DEFAULT_OBJECTS);
        setIsLeader(true);
        setNextId(300);
    }, []);

    const updateObject = useCallback((id: number, updates: Partial<DemoObject>) => {
        setObjects(prev => prev.map(obj =>
            obj.id === id ? { ...obj, ...updates } : obj
        ));
    }, []);

    const removeObject = useCallback((id: number) => {
        if (id === 99) return; // Don't remove player
        setObjects(prev => prev.filter(obj => obj.id !== id));
    }, []);

    const addTeammate = useCallback(() => {
        const id = nextId;
        setNextId(prev => prev + 1);
        setObjects(prev => [...prev, {
            id,
            desc: `Towarzysz ${id}`,
            hp: 6,
            isTeam: true,
            isLeader: false,
            isAttacking: false,
            attackTarget: null,
            isAttackTarget: false,
            isDefenseTarget: false,
            isAvatarTarget: false,
        }]);
    }, [nextId]);

    const addEnemy = useCallback(() => {
        const id = nextId;
        setNextId(prev => prev + 1);
        setObjects(prev => [...prev, {
            id,
            desc: `Wrog ${id}`,
            hp: 6,
            isTeam: false,
            isLeader: false,
            isAttacking: false,
            attackTarget: null,
            isAttackTarget: false,
            isDefenseTarget: false,
            isAvatarTarget: false,
        }]);
    }, [nextId]);

    const toggleAttackTarget = useCallback((id: number) => {
        setObjects(prev => prev.map(obj => ({
            ...obj,
            isAttackTarget: obj.id === id ? !obj.isAttackTarget : false
        })));
    }, []);

    const toggleDefenseTarget = useCallback((id: number) => {
        setObjects(prev => prev.map(obj => ({
            ...obj,
            isDefenseTarget: obj.id === id ? !obj.isDefenseTarget : false
        })));
    }, []);

    const toggleAvatarTarget = useCallback((id: number) => {
        setObjects(prev => prev.map(obj => ({
            ...obj,
            isAvatarTarget: obj.id === id ? !obj.isAvatarTarget : false
        })));
    }, []);

    const setAttackingTarget = useCallback((attackerId: number, targetId: number | null) => {
        setObjects(prev => prev.map(obj =>
            obj.id === attackerId
                ? { ...obj, isAttacking: targetId !== null, attackTarget: targetId }
                : obj
        ));
    }, []);

    useEffect(() => {
        const handleOpen = () => {
            setIsOpen(true);
        };
        eventBus.on('objectListDemo.popup.open', handleOpen);
        return () => {
            eventBus.off('objectListDemo.popup.open', handleOpen);
        };
    }, [setIsOpen]);

    const teammates = objects.filter(o => o.isTeam);
    const enemies = objects.filter(o => !o.isTeam && o.id !== 99);
    const player = objects.find(o => o.id === 99);

    const headerActions = (
        <button
            type="button"
            className="demo-btn demo-btn--small"
            onClick={resetToDefault}
            title="Resetuj do domyslnych"
        >
            Reset
        </button>
    );

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="objectListDemo"
            title="Demo listy obiektow"
            minWidth={400}
            minHeight={300}
            initialWidth={500}
            initialHeight={600}
            className="object-list-demo-popup"
            bodyClassName="object-list-demo-popup__body"
            headerActions={headerActions}
        >
            <div className="demo-popup-content">
                <div className="demo-popup-section">
                    <div className="demo-popup-section__header">
                        <span>Ustawienia gracza</span>
                    </div>
                    <label className="demo-checkbox">
                        <input
                            type="checkbox"
                            checked={isLeader}
                            onChange={(e) => setIsLeader(e.target.checked)}
                        />
                        Jestes liderem druzyny
                    </label>
                    {player && (
                        <div className="demo-object-row">
                            <span className="demo-object-name">HP:</span>
                            <input
                                type="range"
                                min="0"
                                max="6"
                                value={player.hp}
                                onChange={(e) => updateObject(99, { hp: parseInt(e.target.value) })}
                            />
                            <span className="demo-hp-value">{player.hp}</span>
                        </div>
                    )}
                </div>

                <div className="demo-popup-section">
                    <div className="demo-popup-section__header">
                        <span>Druzyna ({teammates.length})</span>
                        <button type="button" className="demo-btn demo-btn--small" onClick={addTeammate}>+ Dodaj</button>
                    </div>
                    {teammates.map(obj => (
                        <div key={obj.id} className="demo-object-card">
                            <div className="demo-object-row">
                                <input
                                    type="text"
                                    className="demo-input"
                                    value={obj.desc}
                                    onChange={(e) => updateObject(obj.id, { desc: e.target.value })}
                                />
                                <button type="button" className="demo-btn demo-btn--small demo-btn--danger" onClick={() => removeObject(obj.id)}>X</button>
                            </div>
                            <div className="demo-object-row">
                                <span>HP:</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="6"
                                    value={obj.hp}
                                    onChange={(e) => updateObject(obj.id, { hp: parseInt(e.target.value) })}
                                />
                                <span className="demo-hp-value">{obj.hp}</span>
                            </div>
                            <div className="demo-object-row demo-object-checkboxes">
                                <label className="demo-checkbox demo-checkbox--small">
                                    <input
                                        type="checkbox"
                                        checked={obj.isAttacking}
                                        onChange={(e) => updateObject(obj.id, { isAttacking: e.target.checked, attackTarget: e.target.checked ? (enemies[0]?.id || null) : null })}
                                    />
                                    Atakuje
                                </label>
                                <label className="demo-checkbox demo-checkbox--small demo-checkbox--defense">
                                    <input
                                        type="checkbox"
                                        checked={obj.isDefenseTarget}
                                        onChange={() => toggleDefenseTarget(obj.id)}
                                    />
                                    Cel obrony
                                </label>
                            </div>
                            {obj.isAttacking && (
                                <div className="demo-object-row">
                                    <span>Cel:</span>
                                    <select
                                        className="demo-select"
                                        value={obj.attackTarget || ''}
                                        onChange={(e) => setAttackingTarget(obj.id, e.target.value ? parseInt(e.target.value) : null)}
                                    >
                                        <option value="">-- wybierz --</option>
                                        {enemies.map(e => (
                                            <option key={e.id} value={e.id}>{e.desc}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="demo-popup-section">
                    <div className="demo-popup-section__header">
                        <span>Wrogowie ({enemies.length})</span>
                        <button type="button" className="demo-btn demo-btn--small" onClick={addEnemy}>+ Dodaj</button>
                    </div>
                    {enemies.map(obj => (
                        <div key={obj.id} className="demo-object-card demo-object-card--enemy">
                            <div className="demo-object-row">
                                <input
                                    type="text"
                                    className="demo-input"
                                    value={obj.desc}
                                    onChange={(e) => updateObject(obj.id, { desc: e.target.value })}
                                />
                                <button type="button" className="demo-btn demo-btn--small demo-btn--danger" onClick={() => removeObject(obj.id)}>X</button>
                            </div>
                            <div className="demo-object-row">
                                <span>HP:</span>
                                <input
                                    type="range"
                                    min="0"
                                    max="6"
                                    value={obj.hp}
                                    onChange={(e) => updateObject(obj.id, { hp: parseInt(e.target.value) })}
                                />
                                <span className="demo-hp-value">{obj.hp}</span>
                            </div>
                            <div className="demo-object-row demo-object-checkboxes">
                                <label className="demo-checkbox demo-checkbox--small">
                                    <input
                                        type="checkbox"
                                        checked={obj.isAttacking}
                                        onChange={(e) => updateObject(obj.id, { isAttacking: e.target.checked, attackTarget: e.target.checked ? 99 : null })}
                                    />
                                    Atakuje
                                </label>
                                <label className="demo-checkbox demo-checkbox--small demo-checkbox--attack">
                                    <input
                                        type="checkbox"
                                        checked={obj.isAttackTarget}
                                        onChange={() => toggleAttackTarget(obj.id)}
                                    />
                                    Cel ataku
                                </label>
                                <label className="demo-checkbox demo-checkbox--small demo-checkbox--target">
                                    <input
                                        type="checkbox"
                                        checked={obj.isAvatarTarget}
                                        onChange={() => toggleAvatarTarget(obj.id)}
                                    />
                                    Twoj cel
                                </label>
                            </div>
                            {obj.isAttacking && (
                                <div className="demo-object-row">
                                    <span>Cel:</span>
                                    <select
                                        className="demo-select"
                                        value={obj.attackTarget || ''}
                                        onChange={(e) => setAttackingTarget(obj.id, e.target.value ? parseInt(e.target.value) : null)}
                                    >
                                        <option value="">-- wybierz --</option>
                                        <option value="99">Ty (gracz)</option>
                                        {teammates.map(t => (
                                            <option key={t.id} value={t.id}>{t.desc}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </DockablePopupWrapper>
    );
};

export default ObjectListDemoPopup;
