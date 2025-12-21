import { useContext } from 'react';
import { LayoutContext, LayoutContextValue } from '../LayoutContext';

export function useLayoutManager(): LayoutContextValue {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayoutManager must be used within a LayoutProvider');
  }
  return context;
}

/**
 * Optional version of useLayoutManager that returns null if not inside LayoutProvider.
 * Used by components that may be rendered outside the layout manager context.
 */
export function useLayoutManagerOptional(): LayoutContextValue | null {
  return useContext(LayoutContext);
}
