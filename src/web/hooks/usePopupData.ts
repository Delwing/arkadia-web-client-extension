import { useEffect, useState } from 'react';
import eventBus, { type ClientEvents } from '@modules/core/eventBus';

export interface UsePopupDataOptions<T, K extends keyof ClientEvents = keyof ClientEvents> {
  /** Function to get initial data when popup opens */
  getInitialData: () => T;
  /** Event name for data updates */
  updateEvent?: K;
  /** Event name for clearing data */
  clearEvent?: keyof ClientEvents;
  /** Transform incoming event data to state data (optional, defaults to identity) */
  transformUpdate?: (eventData: ClientEvents[K]) => T | ((prev: T) => T);
  /** Value to set when cleared (optional, defaults to getInitialData return value) */
  clearedValue?: T;
}

export interface UsePopupDataResult<T> {
  /** Current data */
  data: T;
  /** Set data directly */
  setData: React.Dispatch<React.SetStateAction<T>>;
}

/**
 * Hook that handles common popup data loading and event subscription patterns.
 *
 * - Loads initial data when popup opens
 * - Subscribes to update events
 * - Optionally subscribes to clear events
 *
 * @example
 * ```tsx
 * const { data, setData } = usePopupData(isOpen, {
 *   getInitialData: () => getChatHistory(),
 *   updateEvent: 'chat.newMessage',
 *   transformUpdate: (entry) => (prev) => [...prev, entry].slice(-100),
 *   clearEvent: 'chat.cleared',
 *   clearedValue: [],
 * });
 * ```
 */
export function usePopupData<T, K extends keyof ClientEvents = keyof ClientEvents>(
  isOpen: boolean,
  options: UsePopupDataOptions<T, K>,
): UsePopupDataResult<T> {
  const {
    getInitialData,
    updateEvent,
    clearEvent,
    transformUpdate,
    clearedValue,
  } = options;

  const [data, setData] = useState<T>(() => getInitialData());

  // Load initial data when popup opens
  useEffect(() => {
    if (isOpen) {
      setData(getInitialData());
    }
  }, [isOpen, getInitialData]);

  // Subscribe to update event — only while popup is open to avoid updating hidden state
  useEffect(() => {
    if (!updateEvent || !isOpen) return;

    const handler = ((eventData: ClientEvents[K]) => {
      if (transformUpdate) {
        const result = transformUpdate(eventData);
        if (typeof result === 'function') {
          setData(result as (prev: T) => T);
        } else {
          setData(result);
        }
      } else {
        setData(eventData as unknown as T);
      }
    }) as any;

    return eventBus.on(updateEvent, handler);
  }, [isOpen, updateEvent, transformUpdate]);

  // Subscribe to clear event
  useEffect(() => {
    if (!clearEvent) return;

    const handler = () => {
      setData(clearedValue !== undefined ? clearedValue : getInitialData());
    };

    return eventBus.on(clearEvent, handler as any);
  }, [clearEvent, clearedValue, getInitialData]);

  return { data, setData };
}
