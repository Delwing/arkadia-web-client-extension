import { useCallback, useState } from 'react';
import type Client from '@client/Client';
import { useClientEvent } from './useClientEvent';

export interface GameObject {
    num: number;
    desc?: string;
    hp?: number;
    attack_num?: boolean | number;
    avatar_target?: boolean;
    shortcut: string;
}

/**
 * The objects on the current location, kept live off the same event set the
 * stock ObjectList uses. `gmcp.objects.nums` matters: leaving a room arrives as
 * a nums-only packet, and without it a stale list would linger.
 */
export function useObjects(client: Client): GameObject[] {
    const [objects, setObjects] = useState<GameObject[]>(
        () => client.ObjectManager.getObjectsOnLocation() as GameObject[],
    );
    const refresh = useCallback(() => {
        setObjects(client.ObjectManager.getObjectsOnLocation() as GameObject[]);
    }, [client]);

    useClientEvent('gmcp.objects.nums', refresh);
    useClientEvent('gmcp.objects.data', refresh);
    useClientEvent('gmcp.char.state', refresh);

    return objects;
}
