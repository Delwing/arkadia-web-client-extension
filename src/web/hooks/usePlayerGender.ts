import { useEffect, useState } from 'react';
import { characterStorage } from '@modules/core/storage';
import type { CharGender } from '@shared/events/gmcpTypes';

/**
 * Returns the current player's gender from character storage.
 * Updates reactively when the value changes (e.g. on login / character switch).
 */
export function usePlayerGender(): CharGender | null {
    const [gender, setGender] = useState<CharGender | null>(
        () => characterStorage.get('gender') ?? null,
    );

    useEffect(() => {
        return characterStorage.onChange('gender', (value) => {
            setGender(value ?? null);
        });
    }, []);

    return gender;
}
