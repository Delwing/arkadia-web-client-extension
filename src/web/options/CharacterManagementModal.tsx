import {useState, useEffect} from 'react';
import {Button, Table} from 'react-bootstrap';

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

    return (
        <>
            <p className="text-muted small mb-3">
                Lista postaci, których dane są zapisane w przeglądarce. Możesz usunąć dane wybranej postaci.
            </p>
            {characters.length > 0 ? (
                <Table bordered size="sm" hover className="table-modern table-zebra mb-0">
                    <thead>
                    <tr>
                        <th>Postać</th>
                        <th style={{width: '100px'}} className="text-center">Kluczy</th>
                        <th style={{width: '80px'}}></th>
                    </tr>
                    </thead>
                    <tbody>
                    {characters.map(name => (
                        <tr key={name}>
                            <td>{name.charAt(0).toUpperCase() + name.slice(1).toLowerCase()}</td>
                            <td className="text-center text-muted">{keyCounts[name] || 0}</td>
                            <td>
                                <Button
                                    size="sm"
                                    variant="danger"
                                    onClick={() => handleDelete(name)}
                                >
                                    Usuń
                                </Button>
                            </td>
                        </tr>
                    ))}
                    </tbody>
                </Table>
            ) : (
                <p className="text-muted mb-0">Brak zapisanych postaci.</p>
            )}
        </>
    );
}
