import React, { useCallback, useEffect, useRef, useState } from 'react';
import eventBus from '@modules/core/eventBus';
import { DockablePopupWrapper } from './layout/components/DockablePopupWrapper';
import { usePopup } from './hooks/usePopup';
import { getEmbeddedMap } from './embedRegistry';
import { getNote, type LocationNote } from '@web/options/locationNotesStorage';
import { getPluginLocationNotes, type PluginLocationNote } from '@modules/core/pluginLocationNotesRegistry';
import { getSnapshot as getNpcSnapshot, type NpcListEntry } from '@web/dataStores/npcStore';
import { getSnapshot as getMultibindSnapshot, type StoredMultibindRecord } from '@web/dataStores/multibindStore';
import { getMultibindLabel } from '@client/multibindKeys';

interface CustomLineAttributes {
    color: { r: number; g: number; b: number; alpha: number };
    style: string;
    arrow: boolean;
}

interface CustomLine {
    points: { x: number; y: number }[];
    attributes: CustomLineAttributes;
}

interface RoomData {
    roomId: number;
    hash: string;
    name: string;
    areaName: string;
    x: number;
    y: number;
    z: number;
    env: number;
    envColor: string | null;
    exits: Record<string, number>;
    specialExits: Record<string, number>;
    doors: Record<string, number>;
    customLines: Record<string, CustomLine>;
    userData: Record<string, string>;
}

const POPUP_ID = 'popup:roomInfo';

const DIRECTION_LABELS: Record<string, string> = {
    north: 'polnoc',
    south: 'poludnie',
    east: 'wschod',
    west: 'zachod',
    northeast: 'polnocny-wschod',
    northwest: 'polnocny-zachod',
    southeast: 'poludniowy-wschod',
    southwest: 'poludniowy-zachod',
    up: 'gora',
    down: 'dol',
    in: 'do srodka',
    out: 'na zewnatrz',
};

function formatDirection(dir: string): string {
    return DIRECTION_LABELS[dir] ?? dir;
}

const DOOR_LABELS: Record<number, string> = {
    1: 'otwarte',
    2: 'zamkniete',
    3: 'zablokowane',
};

const RoomInfoPopup: React.FC = () => {
    const [roomData, setRoomData] = useState<RoomData | null>(null);
    const [locationNote, setLocationNote] = useState<LocationNote | null>(null);
    const [pluginNotes, setPluginNotes] = useState<PluginLocationNote[]>([]);
    const [npcs, setNpcs] = useState<NpcListEntry[]>([]);
    const [multibinds, setMultibinds] = useState<StoredMultibindRecord[]>([]);
    const currentRoomIdRef = useRef<number | null>(null);

    const refreshNotes = useCallback((roomId: number) => {
        getNote(roomId).then(note => setLocationNote(note)).catch(() => setLocationNote(null));
        setPluginNotes(getPluginLocationNotes(roomId));
    }, []);

    const handleOpen = useCallback((data: { roomId: number }) => {
        currentRoomIdRef.current = data.roomId;
        const embedded = getEmbeddedMap();
        if (!embedded?.reader) return;

        const room = embedded.reader.getRoom(data.roomId);
        if (!room) {
            setRoomData({
                roomId: data.roomId,
                hash: '',
                name: '(nieznana)',
                areaName: '(nieznany)',
                x: 0,
                y: 0,
                z: 0,
                env: 0,
                envColor: null,
                exits: {},
                specialExits: {},
                doors: {},
                customLines: {},
                userData: {},
            });
            setLocationNote(null);
            setPluginNotes([]);
            setNpcs([]);
            setMultibinds([]);
            return;
        }

        const area = embedded.reader.getArea(room.area);
        const areaName = area?.getAreaName?.() ?? `Obszar ${room.area}`;
        const envColor = embedded.reader.getColorValue?.(room.env) ?? null;

        setRoomData({
            roomId: data.roomId,
            hash: room.hash ?? '',
            name: room.name || `#${data.roomId}`,
            areaName,
            x: room.x ?? 0,
            y: room.y ?? 0,
            z: room.z ?? 0,
            env: room.env ?? 0,
            envColor,
            exits: room.exits ?? {},
            specialExits: room.specialExits ?? {},
            doors: room.doors ?? {},
            customLines: room.customLines ?? {},
            userData: room.userData ?? {},
        });

        refreshNotes(data.roomId);

        getNpcSnapshot().then(snapshot => {
            if (!snapshot) {
                setNpcs([]);
                return;
            }
            const roomNpcs = snapshot.all.data.filter(npc => npc.loc === data.roomId);
            setNpcs(roomNpcs);
        }).catch(() => setNpcs([]));

        getMultibindSnapshot().then(all => {
            setMultibinds(all.filter(mb => mb.roomId === data.roomId).sort((a, b) => a.index - b.index));
        }).catch(() => setMultibinds([]));
    }, [refreshNotes]);

    const { wrapperProps, isOpen } = usePopup<'roomInfo.popup.open'>(POPUP_ID, {
        openEvent: 'roomInfo.popup.open',
        onOpen: handleOpen,
    });

    // Listen for note changes while popup is open
    useEffect(() => {
        if (!isOpen || currentRoomIdRef.current === null) return;
        const roomId = currentRoomIdRef.current;

        const unsub1 = eventBus.on('locationNote.changed', (data) => {
            if (data.roomId === roomId) refreshNotes(roomId);
        });
        const unsub2 = eventBus.on('pluginLocationNote.changed', (data) => {
            if (data.roomId === roomId) refreshNotes(roomId);
        });

        return () => { unsub1(); unsub2(); };
    }, [isOpen, refreshNotes]);

    if (!roomData) {
        return (
            <DockablePopupWrapper
                {...wrapperProps}
                popupType="roomInfo"
                title="Informacje o lokacji"
                minWidth={300}
                minHeight={200}
                initialWidth={380}
                initialHeight={400}
                className="room-info-popup"
                bodyClassName="room-info-popup-body"
            >
                <div className="room-info-popup__empty">Brak danych.</div>
            </DockablePopupWrapper>
        );
    }

    const exitEntries = Object.entries(roomData.exits);
    const specialExitEntries = Object.entries(roomData.specialExits);
    const doorEntries = Object.entries(roomData.doors);
    const customLineEntries = Object.entries(roomData.customLines);

    // Extract known userData keys into dedicated sections
    const mapNote = roomData.userData.note;
    const description = roomData.userData.description;
    const dirBind = roomData.userData.dir_bind;
    const bind = roomData.userData.bind;
    const drinkable = roomData.userData.drinkable;
    const gate = roomData.userData.gate;
    const gpsRaw = roomData.userData.gps;
    const teamFollowLink = roomData.userData.team_follow_link;
    const walkPreCmd = roomData.userData.walk_pre_cmd;
    const walkPostCmd = roomData.userData.walk_post_cmd;

    const KNOWN_USERDATA_KEYS = new Set(['note', 'description', 'dir_bind', 'bind', 'drinkable', 'gate', 'gps', 'team_follow_link', 'walk_pre_cmd', 'walk_post_cmd']);
    const otherUserDataEntries = Object.entries(roomData.userData).filter(([key]) => !KNOWN_USERDATA_KEYS.has(key));

    // Parse dir_bind: "north=n&south=s" -> [["north", "n"], ["south", "s"]]
    const dirBindEntries = dirBind
        ? dirBind.split('&').map(item => item.split('=')).filter(pair => pair.length === 2) as [string, string][]
        : [];

    // Parse gps: JSON array of GPS entries
    let gpsEntries: { gps_string_lines: string[]; room_id: number; area_name?: string; within_room_ids?: number[] }[] = [];
    if (gpsRaw) {
        try {
            gpsEntries = JSON.parse(gpsRaw);
        } catch { /* ignore parse errors */ }
    }

    // Parse team_follow_link: "search*exit#search2*exit2" -> [["search", "exit"], ...]
    const teamFollowEntries = teamFollowLink
        ? teamFollowLink.split('#').map(entry => entry.split('*')).filter(pair => pair.length === 2) as [string, string][]
        : [];

    return (
        <DockablePopupWrapper
            {...wrapperProps}
            popupType="roomInfo"
            title={`Lokacja: ${roomData.roomId}`}
            minWidth={300}
            minHeight={200}
            initialWidth={380}
            initialHeight={400}
            className="room-info-popup"
            bodyClassName="room-info-popup-body"
        >
            <div className="room-info-popup__content">
                {/* Header */}
                <div className="room-info-popup__section">
                    <div className="room-info-popup__row">
                        <span className="room-info-popup__label">ID:</span>
                        <span className="room-info-popup__value">
                            {roomData.roomId}
                            <button
                                className="room-info-popup__copy-btn"
                                title="Kopiuj ID"
                                onClick={() => navigator.clipboard.writeText(String(roomData.roomId))}
                            >&#x2398;</button>
                        </span>
                    </div>
                    {roomData.hash && (
                        <div className="room-info-popup__row">
                            <span className="room-info-popup__label">Hash:</span>
                            <span className="room-info-popup__value">
                                {roomData.hash}
                                <button
                                    className="room-info-popup__copy-btn"
                                    title="Kopiuj hash"
                                    onClick={() => navigator.clipboard.writeText(roomData.hash)}
                                >&#x2398;</button>
                            </span>
                        </div>
                    )}
                    <div className="room-info-popup__row">
                        <span className="room-info-popup__label">Nazwa:</span>
                        <span className="room-info-popup__value">{roomData.name}</span>
                    </div>
                    <div className="room-info-popup__row">
                        <span className="room-info-popup__label">Kraina:</span>
                        <span className="room-info-popup__value">{roomData.areaName}</span>
                    </div>
                    <div className="room-info-popup__row">
                        <span className="room-info-popup__label">Wspolrzedne:</span>
                        <span className="room-info-popup__value">{roomData.x}, {roomData.y}, {roomData.z}</span>
                    </div>
                    <div className="room-info-popup__row">
                        <span className="room-info-popup__label">Srodowisko:</span>
                        <span className="room-info-popup__value">
                            {roomData.envColor && (
                                <span
                                    className="room-info-popup__env-color"
                                    style={{ backgroundColor: roomData.envColor }}
                                />
                            )}
                            {roomData.env}
                        </span>
                    </div>
                </div>

                {/* Exits */}
                {(exitEntries.length > 0 || specialExitEntries.length > 0) && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Wyjscia</div>
                        {exitEntries.map(([dir, targetId]) => (
                            <div key={dir} className="room-info-popup__row">
                                <span className="room-info-popup__label">{formatDirection(dir)}:</span>
                                <span className="room-info-popup__value">
                                    {targetId}
                                    {roomData.doors[dir] != null && (
                                        <span className="room-info-popup__door">
                                            {' '}(drzwi: {DOOR_LABELS[roomData.doors[dir]] ?? roomData.doors[dir]})
                                        </span>
                                    )}
                                </span>
                            </div>
                        ))}
                        {specialExitEntries.map(([cmd, targetId]) => (
                            <div key={cmd} className="room-info-popup__row">
                                <span className="room-info-popup__label room-info-popup__label--special">{cmd}:</span>
                                <span className="room-info-popup__value">{targetId}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Doors without corresponding exits */}
                {doorEntries.filter(([dir]) => !(dir in roomData.exits)).length > 0 && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Drzwi</div>
                        {doorEntries
                            .filter(([dir]) => !(dir in roomData.exits))
                            .map(([dir, state]) => (
                                <div key={dir} className="room-info-popup__row">
                                    <span className="room-info-popup__label">{formatDirection(dir)}:</span>
                                    <span className="room-info-popup__value">
                                        {DOOR_LABELS[state] ?? state}
                                    </span>
                                </div>
                            ))}
                    </div>
                )}

                {/* Custom Lines */}
                {customLineEntries.length > 0 && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Linie</div>
                        {customLineEntries.map(([dir, line]) => {
                            const { r, g, b } = line.attributes.color;
                            const colorHex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                            return (
                                <div key={dir} className="room-info-popup__row">
                                    <span className="room-info-popup__label">{formatDirection(dir)}:</span>
                                    <span className="room-info-popup__value">
                                        <span
                                            className="room-info-popup__env-color"
                                            style={{ backgroundColor: colorHex }}
                                        />
                                        {line.attributes.style}
                                        {line.attributes.arrow && ', strzalka'}
                                        {line.points.length > 0 && ` (${line.points.length} pkt)`}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Notes */}
                {(mapNote || locationNote || pluginNotes.length > 0) && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Notatki</div>
                        {mapNote && (
                            <div className="room-info-popup__note">
                                <span className="room-info-popup__note-label">Notatka mapy:</span>
                                <span className="room-info-popup__note-text">{mapNote}</span>
                            </div>
                        )}
                        {locationNote && (
                            <div className="room-info-popup__note">
                                <span className="room-info-popup__note-label">Notatka uzytkownika:</span>
                                <span className="room-info-popup__note-text">{locationNote.note}</span>
                            </div>
                        )}
                        {pluginNotes.map((pn) => (
                            <div key={pn.pluginId} className="room-info-popup__note">
                                <span className="room-info-popup__note-label">{pn.pluginName}:</span>
                                <span className="room-info-popup__note-text">{pn.note}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Dir Binds */}
                {dirBindEntries.length > 0 && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Bindy kierunkow</div>
                        {dirBindEntries.map(([longDir, shortDir]) => (
                            <div key={longDir} className="room-info-popup__row">
                                <span className="room-info-popup__label">{formatDirection(longDir)}:</span>
                                <span className="room-info-popup__value">{shortDir}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Room Bind */}
                {(bind != null || drinkable != null || gate != null) && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Bindy lokacji</div>
                        {bind != null && (
                            <div className="room-info-popup__row">
                                <span className="room-info-popup__label">bind:</span>
                                <span className="room-info-popup__value">{bind}</span>
                            </div>
                        )}
                        {drinkable != null && (
                            <div className="room-info-popup__row">
                                <span className="room-info-popup__label">drinkable:</span>
                                <span className="room-info-popup__value">tak</span>
                            </div>
                        )}
                        {gate != null && (
                            <div className="room-info-popup__row">
                                <span className="room-info-popup__label">gate:</span>
                                <span className="room-info-popup__value">{gate}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Walk Commands */}
                {(walkPreCmd != null || walkPostCmd != null) && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Komendy chodzenia</div>
                        {walkPreCmd != null && (
                            <div className="room-info-popup__row">
                                <span className="room-info-popup__label">pre:</span>
                                <span className="room-info-popup__value">{walkPreCmd}</span>
                            </div>
                        )}
                        {walkPostCmd != null && (
                            <div className="room-info-popup__row">
                                <span className="room-info-popup__label">post:</span>
                                <span className="room-info-popup__value">{walkPostCmd}</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Multibinds */}
                {multibinds.length > 0 && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Multibindy</div>
                        {multibinds.map(({ index, action }) => (
                            <div key={index} className="room-info-popup__row">
                                <span className="room-info-popup__label">[{getMultibindLabel(index)}]:</span>
                                <span className="room-info-popup__value">{action}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Team Follow Links */}
                {teamFollowEntries.length > 0 && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Team follow</div>
                        {teamFollowEntries.map(([search, exit], i) => (
                            <div key={i} className="room-info-popup__row">
                                <span className="room-info-popup__label">{search}:</span>
                                <span className="room-info-popup__value">{exit}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* GPS */}
                {gpsEntries.length > 0 && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">GPS ({gpsEntries.length})</div>
                        {gpsEntries.map((gps, i) => (
                            <div key={i} className="room-info-popup__gps-entry">
                                <div className="room-info-popup__row">
                                    <span className="room-info-popup__label">room_id:</span>
                                    <span className="room-info-popup__value">{gps.room_id}</span>
                                </div>
                                <div className="room-info-popup__gps-lines">
                                    {gps.gps_string_lines.map((line, j) => (
                                        <div key={j} className="room-info-popup__gps-line">{line}</div>
                                    ))}
                                </div>
                                {gps.area_name && (
                                    <div className="room-info-popup__row">
                                        <span className="room-info-popup__label">area:</span>
                                        <span className="room-info-popup__value">{gps.area_name}</span>
                                    </div>
                                )}
                                {gps.within_room_ids && gps.within_room_ids.length > 0 && (
                                    <div className="room-info-popup__row">
                                        <span className="room-info-popup__label">within:</span>
                                        <span className="room-info-popup__value">{gps.within_room_ids.join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* NPCs */}
                {npcs.length > 0 && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">NPC ({npcs.length})</div>
                        {npcs.map((npc, i) => (
                            <div key={`${npc.name}-${i}`} className="room-info-popup__npc">
                                {npc.name}
                                {npc.source === 'local' && (
                                    <span className="room-info-popup__npc-source"> (lokalne)</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* Description */}
                {description && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Opis</div>
                        <pre className="room-info-popup__description">{description.split('\\n').join('\n')}</pre>
                    </div>
                )}

                {/* Other User Data */}
                {otherUserDataEntries.length > 0 && (
                    <div className="room-info-popup__section">
                        <div className="room-info-popup__section-title">Dane uzytkownika</div>
                        {otherUserDataEntries.map(([key, value]) => (
                            <div key={key} className="room-info-popup__row">
                                <span className="room-info-popup__label">{key}:</span>
                                <span className="room-info-popup__value">{value}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </DockablePopupWrapper>
    );
};

export default RoomInfoPopup;
