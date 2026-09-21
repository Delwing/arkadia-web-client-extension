import {useState, useEffect} from 'react';
import {characterStorage} from '@modules/core/storage';
import {DeleteButton} from '@web-ui/primitives/index.ts';

const IGNORED_CHARACTER_KEY_PREFIXES = new Set([
    "firebase",
    "arkadia",
    "containers",
    "deposits",
    "improve_counter",
    "kill_counter",
    "mapperRoomId",
    "object_num",
    "Player"
]);

function parseCharacterStorageKey(key: string): { name: string; baseKey: string } | null {
    if (!key) return null;
    if (key.includes("://")) return null;
    const firstColon = key.indexOf(":");
    if (firstColon <= 0) return null;
    const prefix = key.slice(0, firstColon);
    if (IGNORED_CHARACTER_KEY_PREFIXES.has(prefix)) {
        return null;
    }
    const name = prefix.trim();
    const baseKey = key.slice(firstColon + 1);
    return name ? {name, baseKey} : null;
}

function collectCharacters(): string[] {
    const names = new Set<string>();
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        const parsed = parseCharacterStorageKey(key);
        if (parsed?.name) {
            names.add(parsed.name);
        }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: "base"}));
}

function countCharacterKeys(characterName: string): number {
    let count = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        const parsed = parseCharacterStorageKey(key);
        if (parsed?.name === characterName) {
            count++;
        }
    }
    return count;
}

function deleteCharacterData(characterName: string): number {
    const keysToDelete: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key) continue;
        const parsed = parseCharacterStorageKey(key);
        if (parsed?.name === characterName) {
            keysToDelete.push(key);
        }
    }
    keysToDelete.forEach(key => localStorage.removeItem(key));
    return keysToDelete.length;
}

/** 1 klucz, 2-4 klucze, 5+ kluczy (12-14 kluczy, 22 klucze). */
function keysLabel(n: number): string {
    if (n === 1) return "1 klucz";
    const lastTwo = n % 100;
    const last = n % 10;
    return `${n} ${last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? "klucze" : "kluczy"}`;
}

export default function CharacterManagement() {
    const [characters, setCharacters] = useState<string[]>([]);
    const [keyCounts, setKeyCounts] = useState<Record<string, number>>({});

    useEffect(() => {
        refreshCharacters();

        const handleShow = () => refreshCharacters();
        window.addEventListener('show-character-management', handleShow);
        return () => window.removeEventListener('show-character-management', handleShow);
    }, []);

    function refreshCharacters() {
        const chars = collectCharacters();
        setCharacters(chars);
        const counts: Record<string, number> = {};
        chars.forEach(name => {
            counts[name] = countCharacterKeys(name);
        });
        setKeyCounts(counts);
    }

    function handleDelete(characterName: string) {
        const confirmed = window.confirm(
            `Czy na pewno chcesz usunąć wszystkie dane postaci "${characterName}"?\n\nTa operacja jest nieodwracalna!`
        );
        if (!confirmed) return;

        deleteCharacterData(characterName);
        refreshCharacters();
        window.dispatchEvent(new Event("storage"));
    }

    const current = characterStorage.getCharacter()?.toLowerCase();
    const displayName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

    return (
        <div className="ui-settings-stack">
            <p className="popup-field__hint">
                Postacie, których dane są zapisane w tej przeglądarce. Usunięcie kasuje wszystkie ich ustawienia i dane — tego nie da się cofnąć.
            </p>
            {characters.length > 0 ? (
                <div className="dialog-list">
                    {characters.map(name => (
                        <div key={name} className="dialog-list__row">
                            <span className="dialog-list__main">
                                {displayName(name)}
                                {name.toLowerCase() === current && <span className="popup-chip">bieżąca</span>}
                            </span>
                            <span className="settings-inline-note">{keysLabel(keyCounts[name] || 0)}</span>
                            <DeleteButton title={`Usuń dane postaci ${displayName(name)}`} onClick={() => handleDelete(name)}/>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="popup-field__hint">Brak zapisanych postaci.</p>
            )}
        </div>
    );
}
